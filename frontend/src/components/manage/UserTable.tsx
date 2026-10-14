"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useToast } from "@/components/ui/Toast";
import { clientApi } from "@/lib/client-api";
import { formatDate } from "@/lib/format";
import type { Role, User } from "@/lib/types";

export function UserTable({ users, meId }: { users: (User & { date_joined: string })[]; meId: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Joined</th>
            <th scope="col">Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <b>{u.display_name}</b> {u.id === meId && <span className="badge badge-neutral">You</span>}
              </td>
              <td>{u.email}</td>
              <td className="small">{formatDate(u.date_joined)}</td>
              <td>
                <select
                  className="select"
                  style={{ width: "auto", minHeight: 34, padding: "4px 30px 4px 10px" }}
                  aria-label={`Role for ${u.email}`}
                  value={u.role}
                  disabled={u.id === meId || pending}
                  onChange={async (e) => {
                    try {
                      await clientApi(`/manage/users/${u.id}/`, { method: "PATCH", json: { role: e.target.value as Role } });
                      toast(`${u.email} is now ${e.target.value === "admin" ? "an admin" : "a student"}`, "success");
                      start(() => router.refresh());
                    } catch (err) {
                      toast((err as Error).message, "error");
                    }
                  }}
                >
                  <option value="student">Student</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
