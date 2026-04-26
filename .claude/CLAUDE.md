# aingan-study 프로젝트 규칙

## Git Push 방법

이 프로젝트는 SSH 인증으로 push한다. remote URL이 SSH로 설정되어 있어야 한다.

```
git remote set-url origin git@github.com:jammy0903/aingan-study.git
git push
```

HTTPS로 push하면 인증 실패가 난다. 항상 SSH remote URL을 사용할 것.
