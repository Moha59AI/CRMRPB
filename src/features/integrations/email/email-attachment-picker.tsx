import { useId } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  EMAIL_ATTACHMENT_ACCEPT,
  formatEmailAttachmentSize,
  MAX_EMAIL_ATTACHMENTS,
  validateEmailAttachmentFiles,
} from './email-service';

interface EmailAttachmentPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

export function EmailAttachmentPicker({ files, onChange, disabled = false }: EmailAttachmentPickerProps) {
  const inputId = useId();

  const addFiles = (selected: FileList | null) => {
    if (!selected?.length) return;
    const next = [...files];
    for (const file of Array.from(selected)) {
      const duplicate = next.some((current) => (
        current.name === file.name
        && current.size === file.size
        && current.lastModified === file.lastModified
      ));
      if (!duplicate) next.push(file);
    }

    try {
      validateEmailAttachmentFiles(next);
      onChange(next);
    } catch (error) {
      toast.error((error as Error)?.message || "Impossible d'ajouter la pièce jointe");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Pièces jointes</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            PDF, image, Word ou Excel · {MAX_EMAIL_ATTACHMENTS} fichiers maximum
          </p>
        </div>
        <input
          id={inputId}
          type="file"
          multiple
          accept={EMAIL_ATTACHMENT_ACCEPT}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <Button asChild variant="outline" size="sm" className="w-full rounded-full sm:w-auto">
          <label
            htmlFor={inputId}
            aria-disabled={disabled}
            className={disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer'}
          >
            <Paperclip className="mr-2 h-4 w-4" />
            Ajouter un fichier
          </label>
        </Button>
      </div>

      {files.length > 0 && (
        <div className="mt-3 space-y-2" aria-live="polite">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatEmailAttachmentSize(file.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full"
                disabled={disabled}
                aria-label={`Retirer ${file.name}`}
                onClick={() => onChange(files.filter((_, currentIndex) => currentIndex !== index))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
