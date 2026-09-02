param(
    [Parameter(Mandatory = $true)][string]$TypeScriptOutput,
    [Parameter(Mandatory = $true)][string]$PhpOutput,
    [Parameter(Mandatory = $true)][string]$SqlOutput
)

$ErrorActionPreference = 'Stop'
$rows = @()
$communes = Invoke-RestMethod -Uri 'https://geo.api.gouv.fr/communes?fields=nom,code,codesPostaux,population&format=json' -Method Get
foreach ($commune in $communes) {
    foreach ($postalCode in $commune.codesPostaux) {
        $rows += [pscustomobject]@{
            postal_code = [string]$postalCode
            city = [string]$commune.nom
            citycode = [string]$commune.code
            population = [int]($commune.population ?? 0)
        }
    }
}

$rows = $rows | Sort-Object postal_code, @{ Expression = 'population'; Descending = $true }, city
$groups = $rows | Group-Object postal_code

$ts = @(
    '// Généré depuis geo.api.gouv.fr — communes de France.'
    '// Ne pas modifier à la main : relancer tools/generate-postal-mapping.ps1.'
    'export interface PostalCity { name: string; citycode: string; }'
    'export const POSTAL_CITIES: Record<string, PostalCity[]> = {'
)
foreach ($group in $groups) {
    $items = $group.Group | ForEach-Object {
        $name = $_.city.Replace('\', '\\').Replace("'", "\'")
        "{ name: '$name', citycode: '$($_.citycode)' }"
    }
    $ts += "  '$($group.Name)': [$($items -join ', ')],"
}
$ts += '};'

$php = @(
    '<?php'
    '// Généré depuis geo.api.gouv.fr — communes de France.'
    'return ['
)
foreach ($group in $groups) {
    $city = $group.Group[0].city.Replace('\', '\\').Replace("'", "\'")
    $php += "    '$($group.Name)' => '$city',"
}
$php += '];'

$sqlSchema = @(
    '/* Généré depuis geo.api.gouv.fr — communes de France. */'
    'create table if not exists public.postal_code_cities ('
    '  postal_code text not null,'
    '  city text not null,'
    '  citycode text not null,'
    '  population integer not null default 0,'
    '  primary key (postal_code, citycode)'
    ');'
    'alter table public.postal_code_cities enable row level security;'
    'revoke all on public.postal_code_cities from anon, authenticated;'
    'grant select, insert, update, delete on public.postal_code_cities to authenticated;'
    ''
    'drop policy if exists "select_postal_code_cities" on public.postal_code_cities;'
    'create policy "select_postal_code_cities" on public.postal_code_cities for select to authenticated using (true);'
    'drop policy if exists "insert_postal_code_cities" on public.postal_code_cities;'
    'create policy "insert_postal_code_cities" on public.postal_code_cities for insert to authenticated with check (public.a_role(array[''admin'']));'
    'drop policy if exists "update_postal_code_cities" on public.postal_code_cities;'
    'create policy "update_postal_code_cities" on public.postal_code_cities for update to authenticated using (public.a_role(array[''admin''])) with check (public.a_role(array[''admin'']));'
    'drop policy if exists "delete_postal_code_cities" on public.postal_code_cities;'
    'create policy "delete_postal_code_cities" on public.postal_code_cities for delete to authenticated using (public.a_role(array[''admin'']));'
    ''
)
$values = foreach ($row in $rows) {
    $city = $row.city.Replace("'", "''")
    "  ('$($row.postal_code)', '$city', '$($row.citycode)', $($row.population))"
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($TypeScriptOutput)) | Out-Null
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($PhpOutput)) | Out-Null
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($SqlOutput)) | Out-Null
[System.IO.File]::WriteAllLines($TypeScriptOutput, $ts, $utf8NoBom)
[System.IO.File]::WriteAllLines($PhpOutput, $php, $utf8NoBom)
[System.IO.File]::WriteAllLines($SqlOutput, $sqlSchema, $utf8NoBom)

$sqlDirectory = [System.IO.Path]::GetDirectoryName($SqlOutput)
$sqlName = [System.IO.Path]::GetFileName($SqlOutput)
if (-not $sqlName.EndsWith('_00_schema.sql')) {
    throw 'SqlOutput doit se terminer par _00_schema.sql pour garantir l ordre des migrations.'
}

$chunkSize = 4000
$chunkCount = [Math]::Ceiling($values.Count / $chunkSize)
for ($chunkIndex = 0; $chunkIndex -lt $chunkCount; $chunkIndex++) {
    $first = $chunkIndex * $chunkSize
    $last = [Math]::Min($first + $chunkSize - 1, $values.Count - 1)
    $chunkNumber = ($chunkIndex + 1).ToString('00')
    $chunkName = $sqlName.Replace('_00_schema.sql', "_${chunkNumber}_data.sql")
    $chunkPath = [System.IO.Path]::Combine($sqlDirectory, $chunkName)
    $chunkSql = @(
        "/* Référentiel postal français — lot $chunkNumber/$($chunkCount.ToString('00')). */"
        'insert into public.postal_code_cities (postal_code, city, citycode, population) values'
        (($values[$first..$last] -join ",`n") + "`non conflict (postal_code, citycode) do update set city = excluded.city, population = excluded.population;")
    )
    [System.IO.File]::WriteAllLines($chunkPath, $chunkSql, $utf8NoBom)
}

Write-Output "Generated $($rows.Count) city/postal-code pairs across $($groups.Count) postal codes in $chunkCount SQL batches."
