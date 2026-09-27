import { clearGuestData, loadGuestBookmarks, loadGuestGroups, loadGuestProgress } from "../lib/guestStore";

const STATUS_RANK = { new: 0, learning: 1, known: 2 };

/**
 * Folds everything built up while signed out (bookmarks, mastery, groups)
 * into the signed-in account, so signing in never loses work. Additive
 * only -- nothing already on the account is removed:
 *  - bookmarks: union.
 *  - mastery: the further-along status wins (known > learning > new), so
 *    a word you'd learned as a guest isn't knocked back by an older entry.
 *  - groups: matched by name; a same-named group gets the union of words.
 * Guest data is cleared only once every write succeeded -- on any error it
 * stays put, and the merge simply runs again on the next sign-in.
 * Runs before the account's data is loaded (see AuthContext.jsx), so the
 * hooks' first fetch already includes it.
 */
export async function mergeGuestData(client, userId) {
  const bookmarks = loadGuestBookmarks();
  const progress = loadGuestProgress();
  const groups = loadGuestGroups();
  if (bookmarks.length === 0 && progress.size === 0 && groups.length === 0) return { merged: false };

  const errors = [];
  const check = ({ error }) => {
    if (error) errors.push(error);
  };

  if (bookmarks.length > 0) {
    check(
      await client.from("saved_items").upsert(
        bookmarks.map((b) => ({
          user_id: userId,
          item_type: "word",
          item_id: b.item_id,
          exported_at: b.exported_at ?? null,
        })),
        { onConflict: "user_id,item_type,item_id", ignoreDuplicates: true }
      )
    );
  }

  if (progress.size > 0) {
    const { data: existing, error } = await client
      .from("user_progress")
      .select("item_type, item_id, status")
      .eq("user_id", userId);
    if (error) {
      errors.push(error);
    } else {
      const accountStatus = new Map(existing.map((r) => [`${r.item_type}:${r.item_id}`, r.status]));
      const now = new Date().toISOString();
      const rows = [];
      for (const [k, status] of progress) {
        const current = accountStatus.get(k);
        if (current !== undefined && (STATUS_RANK[current] ?? -1) >= (STATUS_RANK[status] ?? -1)) continue;
        const sep = k.indexOf(":");
        rows.push({ user_id: userId, item_type: k.slice(0, sep), item_id: k.slice(sep + 1), status, updated_at: now });
      }
      if (rows.length > 0) {
        check(await client.from("user_progress").upsert(rows, { onConflict: "user_id,item_type,item_id" }));
      }
    }
  }

  if (groups.length > 0) {
    const { data: existing, error } = await client.from("groups").select("id, name").eq("user_id", userId);
    if (error) {
      errors.push(error);
    } else {
      const idByName = new Map(existing.map((g) => [g.name, g.id]));
      for (const group of groups) {
        let groupId = idByName.get(group.name);
        if (!groupId) {
          const { data, error: insertError } = await client
            .from("groups")
            .insert({ user_id: userId, name: group.name })
            .select("id, name")
            .single();
          if (insertError) {
            errors.push(insertError);
            continue;
          }
          groupId = data.id;
          idByName.set(group.name, groupId);
        }
        if (group.words.length > 0) {
          check(
            await client
              .from("group_words")
              .upsert(
                group.words.map((word) => ({ group_id: groupId, word })),
                { onConflict: "group_id,word", ignoreDuplicates: true }
              )
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error("Couldn't move everything from this browser into your account:", errors.map((e) => e.message));
    return { merged: false, errors };
  }
  clearGuestData();
  return { merged: true };
}
