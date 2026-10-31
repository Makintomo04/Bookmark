import { createUploadthing, type FileRouter } from "uploadthing/next";
import getCurrentUser from "@/app/actions/getCurrentUser";
import { recordUpload } from "@/lib/uploads";
import { can } from "@/lib/roles";

const f = createUploadthing();

// FileRouter for your app, can contain multiple FileRoutes
export const ourFileRouter = {
  // Define as many FileRoutes as you like, each with a unique routeSlug
  imageUploader: f({ image: { maxFileSize: "4MB" } })
    // Set permissions and file types for this FileRoute
    .middleware(async () => {
      // This code runs on your server before upload. getCurrentUser takes the web's session cookie or the
      // mobile app's bearer token.
      const user = await getCurrentUser();

      // If you throw, the user will not be able to upload
      if (!user?.id) throw new Error("Unauthorized");

      // Whatever is returned here is accessible in onUploadComplete as `metadata`
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // Recorded as this reader's upload, so it stays on their own profile and shelf (lib/uploads.ts).
      await recordUpload({ key: file.key, url: file.url, userId: metadata.userId });
      return { uploadedBy: metadata.userId };
    }),
  // A librarian's cover for the shared catalogue (/staff/catalogue). Not recorded as a reader's upload, which
  // is what lets it be every reader's cover (lib/catalogueFix.ts catalogueCoverFrom refuses readers' ones).
  catalogueCover: f({ image: { maxFileSize: "4MB" } })
    .middleware(async () => {
      const user = await getCurrentUser();
      if (!user?.id || !can(user, "catalogue.edit")) throw new Error("Unauthorized");
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata }) => ({ uploadedBy: metadata.userId })),
} satisfies FileRouter;
 
export type OurFileRouter = typeof ourFileRouter;
