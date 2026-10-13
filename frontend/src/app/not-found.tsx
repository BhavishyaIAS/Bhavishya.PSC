import { SearchX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/bits";

export default function NotFound() {
  return (
    <div className="page page-narrow">
      <EmptyState
        icon={SearchX}
        title="We couldn't find that page"
        action={
          <Link className="btn btn-primary" href="/">
            Back to exams
          </Link>
        }
      >
        It may have moved, or it isn&apos;t published yet.
      </EmptyState>
    </div>
  );
}
