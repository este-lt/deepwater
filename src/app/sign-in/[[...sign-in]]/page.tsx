import { SignIn } from "@clerk/nextjs";
import { EcranConnexion } from "@/components/ecran-connexion";

export default function PageConnexion() {
  return (
    <EcranConnexion>
      <SignIn />
    </EcranConnexion>
  );
}
