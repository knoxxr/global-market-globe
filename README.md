# ORBITAL MARKETS — 실시간 글로벌 주가 · 외환 · 원자재 3D 지구본

Polygon.io 및 Finnhub API를 통해 전 세계 주요 주가지수(14개), 실시간 외환(FX) 통화쌍(9개), 원자재 허브(8개)를 실시간 스트리밍하여 인터랙티브 3D 지구본 위에 직관적으로 시각화하는 Next.js App Router 웹 애플리케이션입니다.

## 핵심 특징

### 1. 직관적인 3D 지구본 금융 시각화 (`Three.js` + `TopoJSON`)
- **주가지수 (14개 거래소)**: 거래소 좌표에 수직 발광 기둥(높이 = 등락률 크기, 색상 = 상승 에메랄드 / 하락 로즈)과 개장 중인 거래소의 실시간 펄스 링 표시.
- **실시간 외환 (9개 통화쌍)**: 두 금융 허브(예: 뉴욕 ↔ 서울 `USD/KRW`, 프랑크푸르트 ↔ 뉴욕 `EUR/USD`)를 잇는 3D 대권(Geodesic) 아크와 강세 방향으로 흐르는 실시간 패킷 애니메이션.
- **원자재 허브 (8개 품목)**: 금(요하네스버그), WTI 원유(휴스턴), 브렌트유(북해), LNG(도하), 구리(산티아고), 은(멕시코시티), 소맥(시카고), 철광석(필바라)에 회전하는 메탈릭 다이아몬드 마커 표시.
- **실시간 태양광 주야간 경계(Solar Terminator)**: 현재 UTC 시각 기반 태양광 셰이더로 낮/밤 반구와 주요 금융 도시의 야간 조명을 표현.

### 2. 다중 접속 API 쿼터 보호 아키텍처 (Vercel 최적화)
동시 접속자가 수천~수만 명으로 늘어나도 외부 API(Polygon.io, Finnhub) 호출이 폭증하지 않도록 3단계 방어 구조를 적용했습니다.

```text
[수천~수만 클라이언트 (Desktop / Mobile)]
        │
        ├─▶ 1차 방어: Vercel Edge CDN (/api/market/snapshot)
        │     Cache-Control: public, s-maxage=15, stale-while-revalidate=45
        │
        ├─▶ 2차 방어: 공유 서버 캐시 SSE 팬아웃 (/api/market/stream)
        │     • 클라이언트별 외부 API 호출 0회 (공유 캐시만 읽고 2.4초 주기 푸시)
        │     • Vercel 60s 제한 대응 45초 롤오버 + 자동 재연결 + 백그라운드 탭 자동 일시정지
        │
        └─▶ 3차 방어: L1 메모리 + L2 Upstash Redis + Singleflight + 분산 락
              • 동시 캐시 미스 시 단 1개의 Promise로 병합 (Singleflight)
              • Redis NX PX 분산 락으로 멀티 리전 중복 호출 방지 (Stale-While-Revalidate)
              • Polygon.io 배치 스냅샷(주기당 최대 2회) & Finnhub 벌크 FX + 라운드로빈 쿼터 제한
              • HTTP 429 발생 시 60초 Circuit Breaker 자동 작동
```

### 3. 모바일 퍼스트 UI & 터치 최적화
- 싱글 핑거 회전, 투 핑거 핀치 줌, 6px 탭 임계치로 오작동 없는 마커 선택.
- 하단 **스냅 바텀 시트(Peek / Half / Full)** 및 상단 가로 스크롤 필터/권역 빠른 이동 칩.
- `viewport-fit=cover` 및 `env(safe-area-inset-*)` 대응.

## 로컬 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

별도 API 키를 설정하지 않아도 **31개 글로벌 주가지수(`^GSPC`, `^KS11`, `^N225` 등) · 실시간 외환(`KRW=X`, `EURUSD=X` 등) · 원자재 선물(`GC=F`, `CL=F`, `BZ=F`, `PL=F` 등) 실제 시세 및 15분봉 일중 차트**가 자동 매핑됩니다.

## Vercel 배포 가이드

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/import?s=https://github.com/knoxxr/global-market-globe)

1. 위 **Deploy with Vercel** 버튼을 클릭하거나 Vercel 대시보드에서 `knoxxr/global-market-globe` 저장소를 Import합니다.
2. **Environment Variables** 설정 (`.env.example` 참고 — 선택 사항, 미설정 시에도 31개 실데이터 피드로 즉시 동작):
   - `POLYGON_API_KEY` (선택): Polygon.io API 키 (설정 시 1순위 배치 스냅샷 적용)
   - `FINNHUB_API_KEY` (선택): Finnhub API 키 (설정 시 2순위 벌크 FX + OANDA 원자재 적용)
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (권장): Vercel Marketplace에서 Upstash Redis 연결 시 전 세계 리전이 단일 캐시를 공유
   - `MARKET_CACHE_TTL_SECONDS`: 글로벌 업스트림 갱신 최소 간격 (기본 `20`초)
   - `CRON_SECRET` (선택): Vercel Pro 이상에서 `/api/cron/refresh` 크론 프리워머를 추가할 때 보호용 토큰
3. Vercel Hobby / Pro 플랜 모두 별도 수정 없이 바로 배포됩니다.

