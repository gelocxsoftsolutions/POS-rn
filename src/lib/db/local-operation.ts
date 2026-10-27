import { Platform } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";
import { getDatabase } from "./connection";

let tail: Promise<unknown> = Promise.resolve();
export function serializeLocalOperation<T>(work: () => Promise<T>): Promise<T> {
  const result = tail.then(work, work);
  tail = result.catch(() => {});
  return result;
}

export function localTransaction<T>(work: (tx: SQLiteDatabase) => Promise<T>): Promise<T> {
  return serializeLocalOperation(async () => {
    const database = await getDatabase();
    let result!: T;
    if (Platform.OS === "web") await database.withTransactionAsync(async () => { result = await work(database); });
    else await database.withExclusiveTransactionAsync(async (tx) => { result = await work(tx); });
    return result;
  });
}
