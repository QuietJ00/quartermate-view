# Quartermate — Claude

@TEAM_RULES.md

작업 전에 `docs/development/parallel-work.md`도 읽는다. 기본 담당은 프론트엔드 화면·스타일·사용 흐름이다. 작업은 지정된 Claude worktree와 별도 `codex/*` 브랜치에서 수행한다.

기존 API·인증·DB 계약을 유지하고, 변경이 필요한 경우 Codex에 전달할 계약과 검사 결과를 기록한다. 다른 도구의 폴더를 수정하거나 main·운영 기준 브랜치를 직접 덮어쓰지 않는다.

완료하면 커밋·push·draft PR과 전체 SHA를 인계한다. 로컬 전용 커밋을 배포하지 않으며 독립적으로 wrangler deploy/rollback, 운영 DB 마이그레이션, DNS/Kakao 변경을 실행하지 않는다. 기본 릴리스 담당은 Codex다. 사용자가 릴리스 담당을 명시적으로 바꿀 경우 공통 규칙의 승인·통합·검증 절차도 함께 따른다.
