# Quartermate — Codex

작업 전에 저장소 루트의 `TEAM_RULES.md`와 `docs/development/parallel-work.md`를 읽고 따른다. 이는 Codex와 Claude의 공통 작업·배포 규칙이다.

Codex의 기본 담당은 API·인증·DB·백엔드 검사와 완료 작업의 통합이다. 프론트 작업을 진행 중인 Claude의 worktree에는 쓰지 않는다. 공개 API를 바꾸면 계약·호출부 영향·마이그레이션 여부를 인계한다.

기본 릴리스 담당은 Codex지만 운영 배포는 검토된 후보 SHA에 대한 사용자 승인 후 별도 릴리스 checkout에서 수행한다. 이 설정 작업 자체는 배포 승인이 아니다. PR은 `main` 대상 draft로 준비한다.
