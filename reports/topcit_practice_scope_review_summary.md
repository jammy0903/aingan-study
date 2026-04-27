# TOPCIT 예상문제 범위 조정 완료 요약

기준은 repo에 DB화된 `topcit_json_v2/topcit_01.json` ~ `topcit_06.json`이다.

## 최종 결과

- 전체 예상문제: 1,050개
- 최종 범위 안 판정: 1,050개
- 남은 `REVIEW`: 0개
- 남은 `LIKELY_OVER_SCOPE`: 0개

## 조정 내용

- 1차 검토 대상 74개를 모두 DB 범위 개념에 맞게 조정했다.
- 기존 오버 항목 43개는 같은 과목의 범위 내 개념으로 치환했다.
- 기존 경계/표현 조정 권장 11개는 DB에 명시된 개념명과 설명 수준에 맞게 낮췄다.
- 자동 점수상 계속 `REVIEW`로 남던 20개도 DB 표현에 직접 맞도록 추가 정리했다.

## 치환 방향

- MSA 세부 패턴, gRPC, Observability 등은 시스템 아키텍처 DB의 클라이언트-서버 구조, 분산 운영, 고가용성, 재난복구, 네트워크 프로토콜, 가상화 개념으로 치환했다.
- CSRF, SSRF, GDPR, PCI DSS, SOC 2, 프롬프트 인젝션 등은 정보보안 DB의 SQL 삽입, XSS, 버퍼 오버플로우, 위험관리, ISMS, ISMS-P, TLS 등으로 치환했다.
- 가명정보, 청약철회권, DRM, 다크 패턴 등은 IT 비즈니스 DB의 개인정보, 지식재산권, 산업재산권, 신지식재산권, 플랫폼 비즈니스, IT 윤리 개념으로 치환했다.
- Agile/Scrum 세부 도구는 프로젝트 관리 DB의 PMBOK, WBS, 주공정 경로, 공정압축법, 공정중첩단축법, EVM, 위험 대응 전략으로 치환했다.

## 산출물

- 수정된 예상문제: `topcit_json_v2/topcit_practice.json`
- 전체 문제별 최종 판정표: `reports/topcit_practice_scope_audit.csv`
- 최종 자동 대조 요약: `reports/topcit_practice_scope_audit.md`
- 치환 재현 스크립트: `scripts/normalize_topcit_practice_scope.py`
- 범위 대조 스크립트: `scripts/audit_topcit_practice_scope.py`
