export async function presenceDeadline<T>(request: PromiseLike<T>, timeoutMs = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('La conexión tardó demasiado. Tu borrador local se conserva; podés volver a intentar.')), timeoutMs);
      })
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
