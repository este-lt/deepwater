import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Tout est protégé sauf les écrans de connexion et le health check.
const estPublique = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/health"]);

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
