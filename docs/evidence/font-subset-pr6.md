# Pretendard를 공식 가변 다이나믹 서브셋으로 교체 (첫 방문 폰트 2.06 MB → 0.16 MB)

> 원본 비공개 저장소 PR #6 본문을 그대로 옮겼습니다(2026-10-19 병합).

## 요약

첫 방문마다 받던 `PretendardVariable.woff2`(2,057,688 B) 전체 파일을 **Pretendard v1.3.9 공식 가변 다이나믹 서브셋**(92개 `unicode-range` 청크, 원본 그대로)으로 교체했습니다. 브라우저는 화면에 있는 글자의 청크만 내려받습니다.

- `public/fonts/pretendard-variable-dynamic-subset/*.woff2` (92개): GitHub `v1.3.9` 태그, `pretendard@1.3.9` npm 패키지와 바이트 단위로 동일
- `app/pretendard-variable.css`: 공식 `pretendardvariable-dynamic-subset.css`와 같고 `url()` 경로만 바꿈. `product-ui.css`의 기존 `@font-face`는 삭제
- 캔버스(결과 포스터·라인업 이미지): 캔버스 텍스트로는 `unicode-range` 다운로드가 일어나지 않습니다. 그래서 `paintWithFonts`가 한 번 그리면서 `ctx.font`별로 측정·출력한 글자를 모으고, 빠진 청크를 `document.fonts.load`로 받은 뒤 다시 그립니다. 두 화면 모두 화면 밖 draft 캔버스에 그리므로 사용자에게 두 번 그리는 과정은 보이지 않습니다. Pretendard 전체 파일을 쓰던 `"Quartermate Poster"` FontFace는 제거했습니다.
- Black Han Sans, Barlow Condensed와 의존성은 바꾸지 않았습니다.

## 측정

| | 이전 | 이후 |
| --- | --- | --- |
| 폰트 파일 (첫 방문 시 받는 크기) | 2,057,688 B (1개) | 청크 92개, 각 8–44 KB (합계 2,957,724 B, 전부 받는 경우는 없음) |
| **비로그인 첫 화면, 로컬 프로덕션 빌드** 폰트 전송량 | 2,057,988 B | **158,532 B** (청크 6개) |
| 같은 화면 전체 전송량 (HTML+JS+CSS+폰트) | 2,456,694 B | **572,713 B** (−77%) |
| 로그인 후 팀 경기 일정 화면 (dev 서버, 같은 폰트 파일) | 2,057,688 B | 253,644 B (청크 9개) |
| 로그인 후 일정·선수단·시즌 분석·설정 4개 탭 누적 | 2,057,688 B | 573,116 B (청크 20개) |
| 결과 포스터 + 라인업 이미지 추가 청크 | (전체 파일 사용) | 청크 5개 |
| CSS 번들 (렌더 차단) | 430,725 B / gzip 70,713 B | 481,028 B / gzip 85,515 B (**+14.8 KB gzip**) |

측정 방법: 새 origin에서 Resource Timing `transferSize`로 측정. 프로덕션 빌드는 `npm run build` 후 `wrangler dev`로 로컬에서 실행. 로그인 화면은 mock 로그인이 dev 서버에만 있어 dev 서버에서 요청된 청크 목록을 기록하고, 파일 크기를 합산했습니다.

참고로 직접 만든 KS X 1001 정적 서브셋(한글 2,350자 + ASCII/Latin‑1/Latin Ext‑A/문장부호/자모)은 469,448 B였습니다. 이 방식은 OFL Reserved Font Name 때문에 글꼴 이름을 바꿔야 하는 수정본이 되고, 그 밖의 한글 8,822자는 시스템 글꼴로 대체됩니다. 그래서 공식 배포본을 택했습니다.

## 희귀 글자 대체

- **한글 11,172자 전부** 다이나믹 서브셋에 포함됩니다. KS X 1001 밖의 `똠 뷁 햏 샾 믜 숖`도 UI와 캔버스 모두 Pretendard로 그려지는 것을 픽셀 비교로 확인했습니다.
- 공식 서브셋에 빠진 글리프는 시스템 글꼴로 대체됩니다 (기존 전체 파일에는 있었음). Latin‑1 범위 29자(악센트 문자 26자 `Á Ã Ä Å Ì Í Ñ Ò Ó Õ Ö Ú Ý` 및 소문자, 그리고 `¦ ¯ µ`)와 UI 기호 `−`(U+2212, 쿼터·상대 득점 감소 버튼), `↻`, `✓`(대회 승부차기·확정 표시)가 해당합니다. `é ü ç ß` 등은 포함됩니다. 한자(`李` 등)는 원래 Pretendard에 없어 이전에도 시스템 글꼴이었습니다.
- 포스터의 팀·선수 이름은 원래 Black Han Sans(헤드라인)로 그려지며 이번 변경과 무관합니다. 포스터 날짜·장소·시간과 라인업 이미지 전체가 Pretendard 청크를 사용합니다.

## 라이선스

- `public/fonts/OFL.txt`는 그대로 두었습니다. upstream `v1.3.9/LICENSE`와 동일함을 확인했습니다 (`Copyright (c) 2021, Kil Hyung-jin ... Reserved Font Name Pretendard`).
- 서브셋 파일은 저작자가 배포한 원본이라 수정본이 아니므로 Reserved Font Name 문제가 없습니다. `public/fonts/README.md`에 출처, 파일 수, 바이트 동일성, CSS 경로 변경 사항을 적었습니다.
- `app/pretendard-variable.css`는 upstream 저작권 헤더를 유지합니다.

## 검증

- [x] `tsc --noEmit` 통과
- [x] `node --experimental-strip-types --test lib/*.test.ts`: 162/162
- [x] `tests/*.test.mjs` 19개 파일: 79/79
- [x] `npm run build` 통과
- [x] 로컬 렌더 (합성 데이터 팀, 희귀 이름 포함): 모바일 375×812, 데스크톱 1440×900 × 라이트/다크. 결과 이미지 대화상자와 포스터/라인업 캔버스를 이전과 나란히 비교
- [ ] Safari·Firefox 실기기 확인은 하지 않았습니다 (Chromium 기반 내장 브라우저로만 확인)

머지·배포하지 않았습니다.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

