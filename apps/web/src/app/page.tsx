import { redirect } from 'next/navigation';

// L'accueil par rôle arrive avec la coquille de l'application (incrément I0.4, PR suivante).
export default function HomePage() {
  redirect('/connexion');
}
