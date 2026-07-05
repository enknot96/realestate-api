import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

// ハッシュ化は一方通行 / 元の文字列には戻せない
export async function hashPassword(password: string): Promise<string> {
  // SALT_ROUNDS で定義した乱数で、ユーザが入力した文字をハッシュ化
  return bcrypt.hash(password, SALT_ROUNDS);
}

// ユーザが入力した文字をハッシュ化し、DBに保存されているハッシュ化されているデータを比べ、一致していれば true を返す
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
