import { redirect } from "next/navigation";

/**
 * `/studio/create` has no page of its own — the three tabs are the surface, and
 * a chooser in front of them would be one click between the user and the thing
 * they came to do. The image tab is the default because it is the cheaper and
 * faster of the two to try.
 */
export default function QuickCreateIndex() {
  redirect("/studio/create/image");
}
