import { randomUUID } from "node:crypto";

export interface Note {
  id: string;
  title: string;
  body: string;
}

/**
 * Almacén en memoria PARTICIONADO por usuario: Map<userId, Map<noteId, Note>>.
 *
 * Es la capa de seguridad #3 (defensa en profundidad): no existe ninguna función
 * que busque una nota solo por id. Para llegar a una nota hay que pasar primero
 * por la partición del usuario, así que un bug en un tool no puede cruzar datos.
 * En una base de datos real equivale a `WHERE user_id = $1` en TODA consulta
 * (o Row Level Security en Postgres).
 */
const db = new Map<string, Map<string, Note>>();

function partition(userId: string) {
  let p = db.get(userId);
  if (!p) db.set(userId, (p = new Map()));
  return p;
}

export const notes = {
  list: (userId: string) => [...partition(userId).values()],
  get: (userId: string, id: string) => partition(userId).get(id),
  add: (userId: string, title: string, body: string) => {
    const note = { id: randomUUID(), title, body };
    partition(userId).set(note.id, note);
    return note;
  },
  remove: (userId: string, id: string) => partition(userId).delete(id),
};

// Datos de ejemplo. IDs fijos y adivinables a propósito, para demostrar que
// conocer el id de una nota ajena no sirve de nada.
partition("alice").set("n1", { id: "n1", title: "Cuenta bancaria", body: "IBAN de Alice: ES00 1111 2222" });
partition("alice").set("n2", { id: "n2", title: "Ideas", body: "Lanzar newsletter en enero" });
partition("bob").set("n1", { id: "n1", title: "Wifi", body: "Clave de Bob: hunter2" });
