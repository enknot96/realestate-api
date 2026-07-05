// class = 「データの形＋振る舞いのひな形」を定義するもの
// → AppErrorという名前の「型」を新しく作っている
export class AppError extends Error {
  // constructor = 「このクラスから実際のオブジェクトを1つ作る（newする）ときに、何を受け取るか」を決める特別な関数
  constructor(
    // public = new AppError(409, 'X', 'msg')で作ったオブジェクトをerrという変数に入れたら、
    // err.statusCode（→409）、err.code（→'X'）で後から取り出せる
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    // super = 「親クラス（Error）のconstructorを呼び出す」という意味
    super(message);
  }
}

// new AppError(...)と書くと、
// constructorに書いた引数の順番通りに値が渡され、AppErrorのインスタンス（実体）が1つ作られる
