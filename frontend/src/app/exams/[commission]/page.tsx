import { ArrowLeft, EyeOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GroupCards } from "@/components/GroupCards";
import { EmptyState } from "@/components/ui/bits";
import { getCommissions } from "@/lib/catalog";
import { currentUser } from "@/lib/server-api";

export async function generateMetadata(props: PageProps<"/exams/[commission]">): Promise<Metadata> {
  const { commission } = await props.params;
  return { title: `${commission.toUpperCase()} — Choose your exam` };
}

export default async function ChooseGroupPage(props: PageProps<"/exams/[commission]">) {
  const { commission: slug } = await props.params;
  const [commissions, user] = await Promise.all([getCommissions(), currentUser()]);
  const commission = commissions.find((c) => c.slug === slug);
  if (!commission) notFound();
  const isAdmin = user?.role === "admin";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{commission.name}</div>
          <h1 className="display-light">Choose Your Exam</h1>
          <p>Pick the service you are preparing for. Everything inside is arranged for that exam.</p>
        </div>
        <div className="page-stage" data-stage aria-hidden />
        <Link href="/" className="btn btn-secondary btn-lg">
          <ArrowLeft size={18} aria-hidden /> All exams
        </Link>
      </div>

      {commission.status === "draft" && (
        <div className="alert alert-info row" style={{ marginBottom: 18 }}>
          <EyeOff size={16} aria-hidden /> <b>Admin preview.</b> {commission.short_name} is hidden from students. Show it from{" "}
          <Link className="link" href="/manage">
            Manage → Dashboard
          </Link>
          .
        </div>
      )}

      {commission.tracks.length === 0 ? (
        <EmptyState title="No exams here yet">
          {isAdmin ? (
            <>
              Add Group 1, Group 2 or any other exam from{" "}
              <Link className="link" href="/manage/exams">
                Manage → Exams
              </Link>
              .
            </>
          ) : (
            "Exams for this commission are being set up. Check back soon."
          )}
        </EmptyState>
      ) : (
        <GroupCards commission={commission} isAdmin={isAdmin} />
      )}

      <nav aria-label="Breadcrumb" className="crumbs crumbs-center">
        <Link href="/">Home</Link> / <span>PSC</span> / <span>{commission.short_name}</span> / <span aria-current="page">Choose Your Exam</span>
      </nav>
    </div>
  );
}
