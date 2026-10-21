import { createRouteHandler } from "uploadthing/next";
 
import { ourFileRouter } from "./core";
 
// Export routes for Next App Router
export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
  config: { 
    // Vercel names it UPLOADTHING_APP_ID; .env.local uses UPLOADTHING_ID.
    uploadthingId: process.env.UPLOADTHING_ID || process.env.UPLOADTHING_APP_ID,
    uploadthingSecret:process.env.UPLOADTHING_SECRET,
   },
});