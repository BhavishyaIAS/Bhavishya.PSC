"use client";

import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/ui/bits";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page page-narrow">
      <EmptyState
        icon={AlertTriangle}
        title="Something went wrong"
        action={
          <button className="btn btn-primary" onClick={() => reset()}>
            Try again
          </button>
        }
      >
        The page couldn&apos;t be loaded. Check your connection and try again.
      </EmptyState>
    </div>
  );
}
