import { type ReactNode } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { navSections, settingsNavSections } from '@/config/navigation';
import { ModuleHero } from '@/components/ModuleHero';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  const { pathname } = useLocation();
  const sections = [...navSections, ...settingsNavSections];
  const items = sections.flatMap((section) => section.items.map((item) => ({
    ...item,
    section: section.titre,
  })));
  const current = [...items]
    .sort((a, b) => b.path.length - a.path.length)
    .find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
  const Icon = current?.icon ?? LayoutDashboard;

  return (
    <div className="gutter-x shrink-0 py-2.5 sm:py-4">
      <ModuleHero
        title={title}
        description={description}
        action={action}
        icon={Icon}
        eyebrow={current ? `${current.section} · ${current.label}` : 'Relais Pare-Brise · CRM'}
      />
    </div>
  );
}
