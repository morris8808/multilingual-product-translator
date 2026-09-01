import { redirect } from "next/navigation";
export default function StoreImagesPage() {
  redirect("/images?sourceMode=store");
}
