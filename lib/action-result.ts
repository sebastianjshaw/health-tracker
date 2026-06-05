export type ActionResult = { ok: true } | { ok: false; error: string };

export function actionOk(): ActionResult {
  return { ok: true };
}

export function actionFail(error: string): ActionResult {
  return { ok: false, error };
}
