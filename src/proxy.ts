import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Tout est protégé sauf les écrans de connexion, le health check, l'icône et le manifeste
// de l'application web (lus par l'iPhone sans session).
const estPublique = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/health", "/apple-icon(.*)", "/manifest.webmanifest"]);

export default clerkMiddleware(async (auth, req) => {
  if (!estPublique(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Ignore les fichiers statiques et internes de Next.js
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
