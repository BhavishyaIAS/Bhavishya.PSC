import type { Metadata } from "next";

import { UserTable } from "@/components/manage/UserTable";
import { Pager } from "@/components/pyq/Pager";
import { load, requireUser } from "@/lib/server-api";
import type { Paginated, User } from "@/lib/types";

export const metadata: Metadata = { title: "Users & roles" };

export default async function UsersPage(props: PageProps<"/manage/users">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = typeof sp.page === "string" ? sp.page : "1";
  const [me, data] = await Promise.all([
    requireUser("/manage/users"),
    load<Paginated<User & { date_joined: string }>>(`/manage/users/?page=${encodeURIComponent(page)}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  ]);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Accounts</div>
          <h1>Users &amp; roles</h1>
          <p>Everyone who signs up is a student. Promote trusted staff to admin here.</p>
        </div>
      </div>
      <section className="panel">
        <form className="toolbar" action="/manage/users">
          <label htmlFor="uq" className="sr-only">
            Search users
          </label>
          <input id="uq" name="q" type="search" className="input search" defaultValue={q} placeholder="Search by name or email" />
          <button className="btn btn-secondary">Search</button>
        </form>
        <UserTable users={data.results} meId={me.id} />
        <Pager page={data.page} numPages={data.num_pages} count={data.count} params={sp} noun="users" />
      </section>
    </div>
  );
}
