# Quartermate 공통 작업 규칙

## 시작할 때

- 현재 저장소 루트, 브랜치, HEAD, 작업 트리 상태를 확인하고 `docs/development/parallel-work.md`를 읽는다.
- 사용자 지시가 역할보다 우선한다. 기본 담당은 Codex: API·인증·DB·통합 검증·릴리스, Claude: 화면·스타일·사용 흐름이다.
- 각자 별도 Git worktree/작업 폴더와 `codex/*` 작업 브랜치를 쓴다. 다른 도구가 사용 중인 폴더·브랜치를 checkout/reset/rebase/stash/clean하지 않는다. 변경 중인 파일을 다른 폴더에서 복사해 합치지 않는다.
- 실행 중인 다른 도구의 완료를 커밋 시각이나 조용한 로그만으로 추정하지 않는다. 완료 커밋 SHA와 인계 내용을 받는다.
- 두 도구가 공유하는 경계는 API 계약이다. API·응답 타입·DB·인증 변경이 필요하면 계약과 함께 인계한다. 역할만으로 해당 파일을 독점하거나 필요한 수정을 임의로 생략하지 않는다.

## 개발·인계

- 검토 기준은 원격에 보존된 통합 코드다. main과 실제 운영 SHA가 다를 수 있으므로 상태 기록을 먼저 확인한다. 현재 기준은 `docs/development/parallel-work.md`에 기록했다.
- 작업 후 커밋·push하고 draft PR을 만든다. 로컬 전용 커밋을 운영 배포하지 않는다. 강제 push나 기존 이력 삭제는 하지 않는다.
- 공통 통합 브랜치에는 완료한 양쪽 작업을 병합하고 함께 검증한다. 한쪽 완료만으로 다른 쪽 작업이 포함됐다고 가정하지 않는다. main 병합은 사용자가 검토·승인한 범위에서 수행한다.
- 인계: 저장소 경로, 브랜치, 전체 SHA, PR 링크, dirty/unpushed 상태, 변경 범위, API/DB 변경, 검사 결과, 배포 여부·버전, 진행 중 서버/프로세스를 기록한다. 키·쿠키·회원 원문은 적지 않는다.
- 프레임워크·잠금 파일을 작업과 무관하게 갱신하지 않는다. 테스트는 합성 데이터와 로컬 D1/R2를 사용한다. `.dev.vars*`, `.env*`, `.wrangler`, DB 덤프·개인정보를 커밋하지 않는다.
- 각 worktree의 node_modules·dist·.wrangler는 별개로 둔다. 다른 worktree의 개발 서버를 중지하거나 빌드 산출물에 쓰지 않는다. 소유한 Wrangler preview를 종료한 뒤 같은 폴더의 dist를 다시 빌드한다.

## 배포

- 기본 릴리스 담당은 Codex 한 곳이다. Claude는 변경을 커밋·push·인계한 뒤 독립 배포하지 않는다. 사용자가 다른 담당을 명시하면 인계 기록도 바꾼다.
- 사용자에게 후보 **전체 SHA**, 포함한 두 작업의 완료 SHA, 대상 Worker·DB·R2, 검증 결과와 미확인 사항을 제시한 뒤 운영 배포 승인을 받는다. 개발·push·PR 생성 요청은 운영 배포 요청과 구분한다.
- 검토된 양쪽 작업이 main에 통합·push된 뒤, 깨끗한 별도 릴리스 checkout에서 승인 SHA를 checkout한다. `npm run release:check -- <승인 SHA> <Claude 완료 SHA> <Codex 완료 SHA>`로 포함 관계·작업 트리·실제 원격 main을 확인한다.
- 배포 검사는 배포를 실행하지 않는다. 사용자 승인과 최신 테스트를 대신하지 않으며 raw wrangler 명령을 기술적으로 막지 않는다. 두 도구 모두 이 절차를 따른다. 배포·롤백은 동시에 하나만 수행한다.
- 테스트는 그 승인 SHA에서 수행한다. 운영 설정으로 새로 빌드하고 산출물의 Worker·바인딩·마이그레이션·사이트 origin을 확인한 뒤 **같은 폴더에서 만든 같은 산출물**만 배포한다. 다른 작업 폴더의 dist를 재사용하지 않는다.
- 사용자 승인 없이 운영 DB/R2 복원·삭제·Sites 배포·DNS/Kakao 설정 변경·과금 자원 생성·법적 문서 확정 게시를 하지 않는다. 법적 문서의 초안 표시는 유지한다. 준비된 배포 템플릿과 CI의 비활성 상태를 임의로 활성화하지 않는다.
- 공개 후 실제 동작과 배포 SHA·Worker 버전을 기록한다. 운영 DB에 새 쓰기가 생긴 뒤 예전 Sites DB나 리허설 export를 복원하지 않는다.

## 계정·키 보호

- 개인 Cloudflare에서 신뢰할 수 없는 oai-authenticated-user-*와 legacy connect를 차단하는 경계를 유지한다.
- 사용자 승인 정책은 만 14세 이상 자기확인이다. 실제 나이 인증으로 표현하지 않으며 birthyear/birthday scope·원문 저장을 켜지 않는다. 기존 계정·팀·역할과 import 검증 게이트를 유지한다.
- Kakao 키 상세 페이지에서는 전체 AX/DOM·키 값·시크릿을 출력하지 않는다. 필요한 설정 항목만 선별 확인한다.
- 이전 준비 기록은 `docs/development/migration-instructions-history.md`, 완료된 전환은 `docs/migration/cutover-plan.review.md`를 참고한다. 과거의 자원 미생성·Sites 운영 상태를 현재 상태로 오인하지 않는다.

## 검사

변경 범위에 맞는 검사에 더해 통합 릴리스 후보에는 아래 검사를 수행한다.

    npm run typecheck
    npm run test:unit
    npm run test:backend
    npm run test:migration
    npm run cf:build
    npm run cf:verify
    npm run test:cloudflare
    python3 scripts/audit-source-history.py

`cf:verify`와 `test:cloudflare`는 로컬 검사용 산출물 기준이다. 이 산출물을 운영에 배포하지 않는다. 운영 빌드 전에는 별도 production 설정과 바인딩을 검토한다.
