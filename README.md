# Gacha Forge · NovelAI Image Delay

마리나라 엔진의 **가챠포지(Gacha Forge)**에서 NovelAI 이미지 생성 요청을 순서대로 처리하고, 다음 요청 전에 **2~5초의 무작위 간격**을 적용하는 비공식 런타임 패치입니다.

엔진과 가챠포지 원본 파일을 직접 수정하지 않습니다. NovelAI의 이용 정책을 준수해 사용해 주세요. **계정 차단 방지나 자동화 탐지 회피를 보장하지 않습니다.**

## 지원 및 확인 환경

- 마리나라 엔진 2.5.0 / Gacha Forge 1.8.12 환경에서 실제 지연 로그를 확인했습니다.
- NovelAI 연결의 첫 요청은 즉시 실행하고, 두 번째부터 직전 요청이 완료된 후 2,000~5,000ms 대기합니다.
- 연결별 메모리 대기열을 사용합니다. 서버/컨테이너를 여러 개 운영하는 경우 대기열은 공유되지 않습니다.
- NovelAI 외 제공자, API 응답 및 오류 처리는 변경하지 않습니다.
- 다음 버전에서도 같은 방식으로 작동한다는 보장은 없습니다.

## 설치 방법 — SSH + curl (Docker Compose)

먼저 **서버에 SSH로 접속**해 주세요. 예시는 root 계정 및 `/root/Marinara-Engine` 설치를 기준으로 합니다. 다른 경로에 설치하셨다면 해당 경로로 변경해 주세요.

### 1. 프로젝트 폴더로 이동

```bash
cd /root/Marinara-Engine || exit 1
```

### 2. GitHub에서 curl로 패치 다운로드

```bash
curl -fL --retry 3 \
  https://raw.githubusercontent.com/tlsiddl/gacha-forge-novelai-delay/main/novelai-gacha-delay.cjs \
  -o novelai-gacha-delay.cjs

ls -lh novelai-gacha-delay.cjs
```

실패했다면 다음 단계로 진행하지 마세요.

### 3. 기존 설정 백업 및 자동 병합

실제로 정상 동작이 확인된 설치 방식처럼, **기존 설정을 백업한 다음 Python으로 필요한 두 항목만 추가합니다.** 수동으로 YAML 전체를 덮어쓸 필요가 없습니다.

아래 코드는 기존 `marinara` 서비스에 `volumes`와 `NODE_OPTIONS`가 이미 있는 일반적인 구성을 위한 것입니다. 원본 설정이 예상과 다르면 **수정하지 않고 중단**합니다.

```bash
cd /root/Marinara-Engine || exit 1

python3 - <<'PY'
from pathlib import Path
from datetime import datetime
import re, shutil

config = Path("docker-compose.override.yml")
patch = Path("novelai-gacha-delay.cjs")
if not patch.is_file() or not config.is_file():
    raise SystemExit("패치 파일 또는 기존 Docker 설정이 없습니다. 중단합니다.")

original = config.read_text()
mount = "      - ./novelai-gacha-delay.cjs:/app/novelai-gacha-delay.cjs:ro"
flag = "--require=/app/novelai-gacha-delay.cjs"

if "novelai-gacha-delay.cjs" in original:
    raise SystemExit("NovelAI 패치 설정이 이미 있습니다. 중복 추가하지 않습니다.")

# 실제 적용에 사용했던 기존 가속 패치 마운트를 기준으로 안전하게 추가합니다.
anchor = "      - ./me-speedup.cjs:/app/me-speedup.cjs:ro"
matches = list(re.finditer(r'(?m)^(\s*NODE_OPTIONS:\s*")([^"\n]*)(")\s*$', original))
if original.count(anchor) != 1 or len(matches) != 1:
    raise SystemExit("기존 설정 형식이 예시와 다릅니다. 수정하지 않았습니다.")

line = matches[0].group(0)
updated_line = line.replace(matches[0].group(2), matches[0].group(2) + " " + flag, 1)
updated = original.replace(anchor, anchor + "\n" + mount, 1)
updated = updated.replace(line, updated_line, 1)

backup = config.with_name(config.name + ".backup." + datetime.now().strftime("%Y%m%d-%H%M%S"))
shutil.copy2(config, backup)
config.write_text(updated)
print("기존 설정 백업:", backup)
print("기존 NODE_OPTIONS 유지 + NovelAI 패치 추가 완료")
PY
```

위 명령어는 **기존 `me-speedup.cjs` 마운트가 있는 서버에서 검증한 설치 흐름**을 기준으로 합니다. 다른 구성에서는 `install-snippet.yml`을 참고하여 기존 설정을 보존한 채 수동 병합해 주세요. 이미 설치한 경우에는 다시 실행하지 마세요.

### 4. 설정 및 문법 검사

```bash
docker compose config -q
docker compose exec -T marinara node --check /app/novelai-gacha-delay.cjs
```

오류가 발생하면 재생성하기 전에 파일 경로와 YAML 들여쓰기를 확인해 주세요.

### 5. 컨테이너 재생성

```bash
docker compose up -d --force-recreate marinara
docker compose ps
```

### 6. 실제 적용 확인

```bash
docker compose logs --since=10m marinara 2>&1 | grep 'gacha-novelai-delay'
```

`preload loaded`만 출력되면 패치 파일을 읽었다는 뜻입니다. **실제 지연을 확인하려면** 가챠포지에서 NovelAI 이미지 생성 또는 다시 그리기를 **순차적으로 두 번** 실행한 뒤 아래 명령어를 사용해 주세요.

```bash
docker compose logs --since=30m marinara 2>&1 \
  | grep -E 'gacha-novelai-delay.*(first NovelAI|waiting)'
```

예시:

```text
[gacha-novelai-delay] first NovelAI image request (no delay)
[gacha-novelai-delay] waiting 3542ms before next NovelAI image request
```

`3542ms`는 요청 전 **3.542초 대기**를 의미합니다. 서비스 자체의 이미지 생성 소요 시간은 포함하지 않습니다. 로그가 없다면 대기 기능이 작동한다고 가정하지 마세요.

## 업데이트 방법

```bash
cd /root/Marinara-Engine || exit 1
cp -a novelai-gacha-delay.cjs "novelai-gacha-delay.cjs.backup.$(date +%Y%m%d-%H%M%S)"
curl -fL --retry 3 \
  https://raw.githubusercontent.com/tlsiddl/gacha-forge-novelai-delay/main/novelai-gacha-delay.cjs \
  -o novelai-gacha-delay.cjs
docker compose exec -T marinara node --check /app/novelai-gacha-delay.cjs && \
docker compose up -d --force-recreate marinara
```

기존 Compose 설정은 유지해 주세요.

## 제거 방법

1. `docker-compose.override.yml`에서 NovelAI 패치의 **볼륨 한 줄**을 제거해 주세요.
2. `NODE_OPTIONS`에서 `--require=/app/novelai-gacha-delay.cjs` **한 항목만** 삭제해 주세요.
3. 기존 가속·한글화·CG 등의 패치는 삭제하지 마세요.
4. 다음 명령어를 실행해 주세요.

```bash
docker compose config -q && docker compose up -d --force-recreate marinara
```

## 자체 테스트

```bash
node --check novelai-gacha-delay.cjs
node selftest.cjs
```

자체 테스트는 모의 요청 검증이며 실제 NovelAI 서비스 정책·호환성을 보장하지 않습니다.
