import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  getFirestore,
  limit as firestoreLimit,
  orderBy as firestoreOrderBy,
  query,
  setDoc,
  where,
  writeBatch,
  type QueryConstraint,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyAIvrrtzorp6e6pwqYugdRc7NMlyT3u6FA",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "eleccionesdosmilveintisiete.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "eleccionesdosmilveintisiete",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "eleccionesdosmilveintisiete.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "839287364260",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:839287364260:web:00e5f0d89e402b1baf6431",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp, "southamerica-east1");

if (typeof window !== "undefined") {
  void setPersistence(firebaseAuth, browserLocalPersistence).catch(() => undefined);
}

export type User = { id: string; email?: string | null };
export type Session = { user: User };

type Filter = { field: string; value: unknown };
type QueryResult = { data: any; error: Error | null; count?: number | null };
type Mode = "select" | "insert" | "update" | "delete";

function sessionFromUser(user: FirebaseUser | null): Session | null {
  return user ? { user: { id: user.uid, email: user.email } } : null;
}

function cleanRecord(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function documentKey(table: string, record: Record<string, unknown>) {
  if (table === "profiles" && record.id) return String(record.id);
  if (table === "memberships" && record.organization_id && record.user_id) {
    return `${record.organization_id}_${record.user_id}`;
  }
  return record.id ? String(record.id) : null;
}

function compareValues(left: unknown, right: unknown) {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  return String(left).localeCompare(String(right), "es", { numeric: true, sensitivity: "base" });
}

class FirebaseQueryBuilder implements PromiseLike<QueryResult> {
  private mode: Mode = "select";
  private filters: Filter[] = [];
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private orderField: string | null = null;
  private ascending = true;
  private maxRows: number | null = null;
  private wantsSingle = false;
  private allowsEmpty = false;

  constructor(private readonly table: string) {}

  select(_columns = "*", _options?: Record<string, unknown>) { return this; }
  insert(payload: Record<string, unknown> | Record<string, unknown>[]) { this.mode = "insert"; this.payload = payload; return this; }
  update(payload: Record<string, unknown>) { this.mode = "update"; this.payload = payload; return this; }
  delete() { this.mode = "delete"; return this; }
  eq(field: string, value: unknown) { this.filters.push({ field, value }); return this; }
  order(field: string, options?: { ascending?: boolean }) { this.orderField = field; this.ascending = options?.ascending !== false; return this; }
  limit(value: number) { this.maxRows = value; return this; }
  single() { this.wantsSingle = true; return this; }
  maybeSingle() { this.wantsSingle = true; this.allowsEmpty = true; return this; }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async matchingDocuments() {
    const idFilter = this.filters.find(filter => filter.field === "id");
    if (idFilter) {
      const snapshot = await getDoc(doc(firestore, this.table, String(idFilter.value)));
      return snapshot.exists() ? [snapshot] : [];
    }

    const constraints: QueryConstraint[] = this.filters.map(filter =>
      where(filter.field === "id" ? documentId() : filter.field, "==", filter.value),
    );
    if (this.orderField) constraints.push(firestoreOrderBy(this.orderField, this.ascending ? "asc" : "desc"));
    if (this.maxRows) constraints.push(firestoreLimit(this.maxRows));
    const snapshot = await getDocs(query(collection(firestore, this.table), ...constraints));
    return snapshot.docs;
  }

  private async enrich(records: Record<string, unknown>[]) {
    if (this.table !== "memberships") return records;
    return Promise.all(records.map(async record => {
      const userId = String(record.user_id ?? "");
      if (!userId) return record;
      const profileSnapshot = await getDoc(doc(firestore, "profiles", userId));
      return { ...record, profiles: profileSnapshot.exists() ? { id: profileSnapshot.id, ...profileSnapshot.data() } : null };
    }));
  }

  private async execute(): Promise<QueryResult> {
    try {
      if (this.mode === "insert") {
        const entries = (Array.isArray(this.payload) ? this.payload : [this.payload])
          .filter(Boolean).map(item => cleanRecord(item as Record<string, unknown>));
        const created: Record<string, unknown>[] = [];
        for (const entry of entries) {
          const now = new Date().toISOString();
          const value = { created_at: entry.created_at ?? now, updated_at: entry.updated_at ?? now, ...entry };
          const key = documentKey(this.table, value);
          if (key) {
            await setDoc(doc(firestore, this.table, key), value, { merge: true });
            created.push({ id: key, ...value });
          } else {
            const reference = await addDoc(collection(firestore, this.table), value);
            created.push({ id: reference.id, ...value });
          }
        }
        return { data: this.wantsSingle ? (created[0] ?? null) : created, error: null };
      }

      const snapshots = await this.matchingDocuments();
      if (this.mode === "update") {
        const value = cleanRecord({ ...(this.payload as Record<string, unknown>), updated_at: new Date().toISOString() });
        const batch = writeBatch(firestore);
        snapshots.forEach(snapshot => batch.update(snapshot.ref, value));
        await batch.commit();
        return { data: snapshots.map(snapshot => ({ id: snapshot.id, ...snapshot.data(), ...value })), error: null };
      }
      if (this.mode === "delete") {
        await Promise.all(snapshots.map(snapshot => deleteDoc(snapshot.ref)));
        return { data: null, error: null };
      }

      let rows = snapshots.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
      rows = await this.enrich(rows);
      if (this.orderField) {
        const direction = this.ascending ? 1 : -1;
        rows.sort((left, right) => compareValues(left[this.orderField!], right[this.orderField!]) * direction);
      }
      if (this.maxRows) rows = rows.slice(0, this.maxRows);
      if (this.wantsSingle) {
        if (!rows.length && !this.allowsEmpty) return { data: null, error: new Error("Registro no encontrado") };
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null, count: rows.length };
    } catch (cause) {
      return { data: null, error: cause instanceof Error ? cause : new Error("Error de Firebase") };
    }
  }
}

export const firebase = {
  auth: {
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try { await signInWithEmailAndPassword(firebaseAuth, email, password); return { error: null }; }
      catch (cause) { return { error: cause instanceof Error ? cause : new Error("No se pudo ingresar") }; }
    },
    async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
      try { await sendPasswordResetEmail(firebaseAuth, email, options?.redirectTo ? { url: options.redirectTo } : undefined); return { error: null }; }
      catch (cause) { return { error: cause instanceof Error ? cause : new Error("No se pudo enviar el correo") }; }
    },
    async getSession() {
      await firebaseAuth.authStateReady();
      return { data: { session: sessionFromUser(firebaseAuth.currentUser) } };
    },
    onAuthStateChange(callback: (event: string, session: Session | null) => void) {
      const unsubscribe = onAuthStateChanged(firebaseAuth, user => callback(user ? "SIGNED_IN" : "SIGNED_OUT", sessionFromUser(user)));
      return { data: { subscription: { unsubscribe } } };
    },
    async signOut() { await signOut(firebaseAuth); },
  },
  from(table: string) { return new FirebaseQueryBuilder(table); },
  functions: {
    async invoke(name: string, { body }: { body: Record<string, unknown> }) {
      try {
        const callable = httpsCallable<Record<string, unknown>, any>(functions, name.replaceAll("-", "_"));
        const result = await callable(body);
        if (name === "invite-team-member" && body.action !== "remove" && typeof body.email === "string") {
          await sendPasswordResetEmail(firebaseAuth, body.email, { url: window.location.origin });
        }
        return { data: result.data, error: null };
      } catch (cause) {
        return { data: null, error: cause instanceof Error ? cause : new Error("No se pudo ejecutar la operación") };
      }
    },
  },
};
