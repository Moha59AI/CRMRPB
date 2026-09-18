// Traduction des erreurs Google en actions
//
// Google renvoie des messages longs, en anglais, avec l'URL de correction
// noyee dans le texte. Affiches tels quels sous un badge « Connecte », ils
// se lisent comme « ca ne marche pas » -- alors que la plupart se reglent en
// un clic, et pas dans le CRM.
//
// Ce module reconnait les cas courants et dit, en francais, ce qu'il faut
// faire et ou. Tout ce qu'il ne reconnait pas est rendu tel quel : mieux
// vaut un message brut qu'une traduction fausse.

export interface ErreurGoogleInterpretee {
  titre: string;
  explication: string;
  /** Lien vers l'endroit ou se regle le probleme, quand il existe. */
  lien?: { url: string; label: string };
  /** Ce que l'utilisateur doit faire dans le CRM une fois le probleme regle. */
  suite?: 'synchroniser' | 'reautoriser';
  brut: string;
}

export function interpreterErreurGoogle(message: string): ErreurGoogleInterpretee {
  const brut = message.trim();

  // API non activee dans le projet Cloud. Le numero de projet est dans le
  // message : on construit le lien exact vers la page d'activation.
  const apiDesactivee = brut.match(/has not been used in project (\d+) before or it is disabled/i);
  if (apiDesactivee) {
    const projet = apiDesactivee[1];
    return {
      titre: "L'API Google Agenda n'est pas activée",
      explication:
        `L'autorisation est bien accordée, mais l'API Calendar est désactivée dans votre projet Google Cloud (${projet}). ` +
        "Activez-la, patientez deux ou trois minutes, puis relancez la synchronisation.",
      lien: {
        url: `https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=${projet}`,
        label: 'Activer l’API Calendar',
      },
      suite: 'synchroniser',
      brut,
    };
  }

  // Jeton revoque ou expire : il faut repasser par le consentement.
  if (/invalid_grant|token has been expired or revoked|invalid_token/i.test(brut)) {
    return {
      titre: 'Autorisation Google expirée',
      explication:
        "Google a révoqué l'accès du CRM à votre agenda — mot de passe changé, accès retiré depuis votre compte, ou jeton trop ancien. " +
        'Renouvelez l’autorisation pour continuer.',
      suite: 'reautoriser',
      brut,
    };
  }

  // Portee manquante : l'autorisation a ete donnee sans l'agenda.
  if (/insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT|Request had insufficient authentication scopes/i.test(brut)) {
    return {
      titre: 'Autorisation incomplète',
      explication:
        "Le compte Google a été connecté sans l'accès à l'agenda. Renouvelez l'autorisation et acceptez l'accès aux événements.",
      suite: 'reautoriser',
      brut,
    };
  }

  // Ecran de consentement en mode « test » : seuls les comptes declares passent.
  if (/access_denied|has not completed the Google verification process|403.*(?:unverified|testing)/i.test(brut)) {
    return {
      titre: 'Compte Google non autorisé sur cette application',
      explication:
        "L'écran de consentement OAuth est encore en mode test : seuls les comptes ajoutés comme testeurs peuvent se connecter. " +
        'Ajoutez votre adresse dans la liste des testeurs, ou publiez l’application.',
      lien: {
        url: 'https://console.cloud.google.com/apis/credentials/consent',
        label: 'Écran de consentement OAuth',
      },
      suite: 'reautoriser',
      brut,
    };
  }

  return {
    titre: 'Google a refusé la synchronisation',
    explication: brut,
    brut,
  };
}
