// 접속(presence) 판정. **서버에서만** 호출한다.
//
// 예전에는 클라이언트가 `Date.now() - last_seen` 을 직접 계산했다. last_seen 은 서버
// 시각으로 기록되므로, 학생 PC 시계가 판정 창만큼 앞서 있으면 상대가 아무리 하트비트를
// 보내도 영원히 오프라인으로 보였다. 두 시각을 한 시계(서버)에서만 비교하면 사라지는 문제다.

/**
 * 온라인으로 볼 마지막 하트비트 이후 시간.
 *
 * 하트비트는 10초마다 돌지만 브라우저는 **숨겨진 탭의 타이머를 1분에 한 번까지 늦춘다.**
 * 창이 45초였을 때는 멘토가 다른 탭·다른 창을 보는 것만으로 스로틀된 60초 주기가 창을
 * 넘겨 오프라인으로 떨어졌다. 90초는 그 60초를 확실히 덮는다.
 */
export const PRESENCE_ONLINE_MS = 90_000;

/** 타임스탬프가 판정 창 안에 있는가. 값이 없거나 파싱되지 않으면 오프라인. */
export function isFresh(ts: string | null | undefined, windowMs: number = PRESENCE_ONLINE_MS): boolean {
  if (!ts) return false;
  const t = Date.parse(ts);
  return Number.isFinite(t) && Date.now() - t < windowMs;
}
