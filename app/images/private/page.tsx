import { redirect } from "next/navigation";
export default function PrivateImagesPage() {
  redirect("/images?sourceMode=private");
}
