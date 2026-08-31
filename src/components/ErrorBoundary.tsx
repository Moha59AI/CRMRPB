import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Message métier affiché à l'utilisateur. */
  titre?: string;
  message?: string;
  /**
   * Quand cette valeur change, la limite se réarme. Passer le chemin courant
   * permet de repartir d'un état sain en changeant de page, au lieu de rester
   * bloqué sur l'écran d'erreur.
   */
  resetKey?: string;
  /** Occupe tout l'écran (racine) ou seulement la zone de contenu (module). */
  pleinEcran?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Limite d'erreur.
 *
 * Le message technique n'est jamais montré à l'utilisateur : il part dans la
 * console pour le diagnostic, et l'écran affiche une phrase compréhensible.
 * Une pile d'appels Radix en anglais n'apprend rien à un conseiller au
 * téléphone, et donne l'impression que tout est cassé.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary:', error, info);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  reessayer = () => {
    this.setState({ hasError: false, error: null });
  };

  recharger = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const {
      titre = 'Une erreur est survenue',
      message = "Cette partie du CRM n'a pas pu s'afficher. Le reste de l'application reste utilisable.",
      pleinEcran = false,
    } = this.props;

    return (
      <div className={`flex items-center justify-center bg-background p-8 ${
        pleinEcran ? 'min-h-screen' : 'h-full min-h-[400px]'
      }`}>
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="mb-2 text-xl font-semibold text-foreground">{titre}</h1>
          <p className="mb-6 text-sm text-muted-foreground">{message}</p>

          <div className="flex items-center justify-center gap-2">
            <button
              onClick={pleinEcran ? this.recharger : this.reessayer}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <RefreshCw className="h-4 w-4" />
              Réessayer
            </button>
            {!pleinEcran && (
              <button
                onClick={this.recharger}
                className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                Recharger la page
              </button>
            )}
          </div>

          {/* Le detail technique reste accessible pour un signalement, mais
              replie : il n'a pas a etre la premiere chose que l'on lit. */}
          {this.state.error?.message && (
            <details className="mt-6 text-left">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Détail technique
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-left text-[11px] text-muted-foreground">
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
