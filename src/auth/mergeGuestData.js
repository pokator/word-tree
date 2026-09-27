import { loadGuestBookmarks, loadGuestGroups, loadGuestProgress, removeMergedGuestData } from "../lib/guestStore";

const STATUS_RANK = { new: 0, learning: 1, known: 2 };
// Keeps each `.in()` filter's URL comfortably short.
const ID_CHUNK = 200;
// Each pass merges a snapshot, then removes exactly that snapshot from the
// guest store; anything written mid-pass is picked up by the next one.
// Bounded so a guest store that somehow never drains can't loop forever --
// leftovers just wait for the next sign-in.
const MAX_PASSES = 3;

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Folds everything built up while signed out (bookmarks, mastery, groups)
 * into the signed-in account, so signing in never loses work. Additive
 * only -- nothing already on the account is removed:
 *  - bookmarks: union.
 *  - mastery: the further-along status wins (known > learning > new), so
 *    a word you'd learned as a guest isn't knocked back by an older entry.
 *  - groups: matched by name; a same-named group gets the union of words.
 * Guest data is removed only once every write in a pass succeeded -- and
 * then only what that pass copied, so anything bookmarked mid-merge (the
 * app stays usable in guest mode meanwhile) survives to the next pass. On
 * any error it all stays put, and the merge simply runs again on the next
 * sign-in.
 * Runs before the account's data is loaded (see AuthContext.jsx), so the
 * hooks' first fetch already includes it.
 */
export async function mergeGuestData(client, userId) {
  let merged = false;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const snapshot = { bookmarks: loadGuestBookmarks(), progress: loadGuestProgress(), groups: loadGuestGroups() };
    if (snapshot.bookmarks.length === 0 && snapshot.progress.size === 0 && snapshot.groups.length === 0) break;
    const errors = await mergeSnapshot(client, userId, snapshot);
    if (errors.length > 0) {
      console.error("Couldn't move everything from this browser into your account:", errors.map((e) => e.message));
      return { merged, errors };
    }
    merged = true;
    if (!removeMergedGuestData(snapshot)) break;
  }
  return { merged };
}

async function mergeSnapshot(client, userId, { bookmarks, progress, groups }) {
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
          found_from: b.found_from ?? null,
        })),
        { onConflict: "user_id,item_type,item_id", ignoreDuplicates: true }
      )
    );
  }

  if (progress.size > 0) {
    // Only the rows the guest actually has an opinion on -- reading the
    // whole table would silently stop at the API's row cap (1000 by
    // default), and any account row past it would look absent and get
    // overwritten by an earlier guest status.
    const ids = [...new Set([...progress.keys()].map((k) => k.slice(k.indexOf(":") + 1)))];
    const accountStatus = new Map();
    let readFailed = false;
    for (const chunk of chunks(ids, ID_CHUNK)) {
      const { data, error } = await client
        .from("user_progress")
        .select("item_type, item_id, status")
        .eq("user_id", userId)
        .in("item_id", chunk);
      if (error) {
        errors.push(error);
        readFailed = true;
        break;
      }
      for (const r of data) accountStatus.set(`${r.item_type}:${r.item_id}`, r.status);
    }
    if (!readFailed) {
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

  return errors;
}
