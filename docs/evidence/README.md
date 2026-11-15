# 근거 문서

운영 중인 Quartermate의 원본 저장소는 운영 설정과 내부 문서가 섞여 있어 비공개입니다. 이 폴더에는 그중 에이전트 작업 규칙과 요청량 측정 기록만 골라 옮겼습니다. 문서 안의 커밋 해시(SHA)와 PR 링크는 비공개 원본을 가리키므로 열리지 않습니다.

## 에이전트 작업 규칙 (`rules/`)

| 파일 | 내용 |
|---|---|
| [TEAM_RULES.md](rules/TEAM_RULES.md) | Codex와 Claude가 함께 따르는 작업, 인계, 배포, 검사 규칙 |
| [AGENTS.md](rules/AGENTS.md) | Codex가 처음 읽는 문서. TEAM_RULES.md를 따르게 함 |
| [CLAUDE.md](rules/CLAUDE.md) | Claude가 처음 읽는 문서. 같은 규칙을 참조 |

## 요청량 최적화: 재현, 수정, 재측정 (`measurements/`)

단계마다 수정 전 상태를 먼저 재현해 기록하고, 같은 스크립트로 수정 후를 다시 쟀습니다. 숫자는 클라이언트 API 호출의 재현 측정이며 운영 트래픽 실측이 아닙니다.

| 단계 | 문서 | 원본 결과 |
|---|---|---|
| 2 | [수정 전 측정](measurements/request-optimization-measurements.md) | |
| 3 | [중복 조회 제거](measurements/request-optimization-stage3.md) | |
| 4 | [오래된 응답과 화면 수명 검증](measurements/request-optimization-stage4.md): 경합 시나리오 12개 중 8개 실패 → 16개 통과 | [수정 전](measurements/request-optimization-stage4-before.json), [수정 후](measurements/request-optimization-stage4-results.json) |
| 5 | [경기 상태별 조회 주기](measurements/request-optimization-stage5.md): 진행 중이 아닌 경기의 일정 화면 분당 24회 → 8회 | [결과](measurements/request-optimization-stage5-results.json) |
| 6 | [두 세션 동기화 검증](measurements/request-optimization-stage6.md): 실제 브라우저에서 찾은 버그 2개 | |

## 측정·점검 스크립트 (`scripts/`)

원본 저장소의 화면 컴포넌트를 불러오므로 이 저장소에서는 실행되지 않습니다. 측정 방식을 보여 주는 참고용입니다.

| 파일 | 하는 일 |
|---|---|
| [measure-client-requests.mjs](scripts/measure-client-requests.mjs) | 실제 화면을 jsdom과 가상 시계로 실행해 화면별 API 호출 수를 셈 |
| [measure-client-races.mjs](scripts/measure-client-races.mjs) | 응답 순서를 조작해 오래된 응답이 새 상태를 덮어쓰는 경합을 재현 |
| [measure-client-polling.mjs](scripts/measure-client-polling.mjs) | 경기 상태와 화면에 따라 조회 주기가 바뀌는지 확인 |
| [release-preflight.mjs](scripts/release-preflight.mjs) | `release:check`. 배포 후보에 두 에이전트의 완료 커밋이 모두 들어 있고 원격 main과 같은지 확인 |

경합 수정의 핵심인 조회 조정기는 이 저장소의 [src/client/read-coordinator.ts](../../src/client/read-coordinator.ts)에 그대로 옮겼고, 단위 테스트 8개가 CI에서 실행됩니다.

## 기술 선택 기록

[font-subset-pr6.md](font-subset-pr6.md): 한글 폰트를 줄일 때 정적 서브셋과 공식 다이나믹 서브셋을 비교하고, 라이선스와 글자 수 때문에 후자를 택한 PR 본문. 비로그인 첫 화면 전송량 2.46 MB → 573 KB(로컬 프로덕션 빌드).
