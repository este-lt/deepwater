import { SignUp } from "@clerk/nextjs";
import { EcranConnexion } from "@/components/ecran-connexion";

export default function PageInscription() {
  return (
    <EcranConnexion>
      <SignUp />
    </EcranConnexion>
  );
}
