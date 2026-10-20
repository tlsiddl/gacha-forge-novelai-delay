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

**입력 명령어**

```bash
cd /root/Marinara-Engine || exit 1
```

**정상 예시**

```text
root@서버이름:~/Marinara-Engine#
```

별도의 오류 없이 프로젝트 폴더로 이동하면 정상입니다.

### 2. GitHub에서 curl로 패치 다운로드

```bash
curl -fL --retry 3 \
  https://raw.githubusercontent.com/tlsiddl/gacha-forge-novelai-delay/main/novelai-gacha-delay.cjs \
  -o novelai-gacha-delay.cjs

ls -lh novelai-gacha-delay.cjs
```

**정상 출력 예시**

```text
100  2xxx  100  2xxx  ...
-rw-r--r-- 1 root root 2.xK ... novelai-gacha-delay.cjs
```

파일 크기와 다운로드 속도는 버전에 따라 달라질 수 있습니다. `curl: (22)` 또는 `404` 오류가 나오면 다음 단계로 진행하지 마세요.

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

**정상 출력 예시**

```text
기존 설정 백업: docker-compose.override.yml.backup.20261020-134200
기존 NODE_OPTIONS 유지 + NovelAI 패치 추가 완료
```

백업 파일명의 날짜와 시간은 설치 시점마다 달라집니다. 기존 패치 설정을 유지하면서 새 패치 경로를 추가했다는 메시지가 나오면 정상입니다.

위 명령어는 **기존 `me-speedup.cjs` 마운트가 있는 서버에서 검증한 설치 흐름**을 기준으로 합니다. 다른 구성에서는 `install-snippet.yml`을 참고하여 기존 설정을 보존한 채 수동 병합해 주세요. 이미 설치한 경우에는 다시 실행하지 마세요.

### 4. 설정 및 문법 검사

```bash
docker compose config -q && echo "Docker 설정 정상"
docker compose run --rm --no-deps --entrypoint node marinara --check /app/novelai-gacha-delay.cjs && echo "JavaScript 문법 정상"
```

**정상 출력 예시**

```text
Docker 설정 정상
JavaScript 문법 정상
```

`docker compose config -q`와 `node --check`는 성공해도 원래 별도의 메시지를 출력하지 않으므로, 위의 `echo`로 성공 여부를 표시합니다. 아직 새 볼륨을 적용하지 않은 상태에서도 검사할 수 있도록 `exec` 대신 `run`을 사용합니다. 오류가 발생하면 재생성하기 전에 파일 경로와 YAML 들여쓰기를 확인해 주세요.

### 5. 컨테이너 재생성

```bash
docker compose up -d --force-recreate marinara
docker compose ps
```

**정상 출력 예시**

```text
[+] up 1/1
 ✔ Container marinara-engine-marinara-1 Started
NAME                         IMAGE                                      SERVICE    STATUS
marinara-engine-marinara-1   ghcr.io/pasta-devs/marinara-engine:latest  marinara   Up ...
```

출력 형식과 시간은 Docker Compose 버전에 따라 다릅니다. `docker compose ps`에서 `marinara` 서비스가 `Up`으로 표시되면 실행 중인 것입니다. 다만 정상 서비스 응답까지 보장하는 검사는 아닙니다.

### 6. 패치 로딩 확인

```bash
docker compose logs --since=10m marinara 2>&1 \
  | grep 'gacha-novelai-delay'
```

**정상 출력 예시**

```text
marinara-1  | [gacha-novelai-delay] preload loaded; NovelAI-only gating is active when provider metadata is recognized
```

위 메시지는 패치 파일을 **불러왔다는 의미**입니다. 이것만으로 실제 요청 간격이 적용됐다고 판단하지 마세요.

### 7. 이미지 생성 후 대기 시간 확인

가챠포지에서 **NovelAI 이미지 생성 또는 다시 그리기를 순차적으로 두 번** 실행해 주세요. 첫 번째 이미지가 완전히 생성된 뒤 두 번째를 요청하시면 됩니다.

```bash
docker compose logs --since=30m marinara 2>&1 \
  | grep -E 'gacha-novelai-delay.*(first NovelAI|waiting)'
```

**정상 출력 예시 (실제 확인된 대기 시간)**

```text
marinara-1  | [gacha-novelai-delay] first NovelAI image request (no delay)
marinara-1  | [gacha-novelai-delay] waiting 3542ms before next NovelAI image request
```

- `first NovelAI image request (no delay)`: 첫 이미지 생성 요청은 즉시 전송합니다.
- `waiting 3542ms ...`: 다음 요청을 보내기 전에 **3.542초** 대기합니다.
- 대기 시간은 매번 달라지며 2,000~5,000ms 범위입니다. **이미지 생성 자체에 걸린 시간은 포함되지 않습니다.**

**실시간 로그 확인**

```bash
docker compose logs -f --since=1m marinara 2>&1 \
  | grep --line-buffered 'gacha-novelai-delay'
```

로그 확인을 끝내려면 `Ctrl+C`를 누르세요. 로그 보기만 종료되고 서버는 계속 실행됩니다.

### 8. 로그가 나오지 않을 때

- `preload loaded`만 나온다면 **로드는 됐지만 실제 이미지 지연 여부는 미확인**입니다.
- `first NovelAI`만 나온다면 다음 이미지 생성 요청이 아직 인식되지 않았을 수 있습니다.
- 아무 로그도 없다면 컨테이너 재생성 여부, `NODE_OPTIONS`, 볼륨 마운트 및 가챠포지 버전을 확인해 주세요.
- 실제로 `waiting ...ms`가 나온 경우에만 이미지 생성 요청 대기가 실행된 것으로 판단해 주세요.

## 업데이트 방법

```bash
cd /root/Marinara-Engine || exit 1
cp -a novelai-gacha-delay.cjs "novelai-gacha-delay.cjs.backup.$(date +%Y%m%d-%H%M%S)"
curl -fL --retry 3 \
  https://raw.githubusercontent.com/tlsiddl/gacha-forge-novelai-delay/main/novelai-gacha-delay.cjs \
  -o novelai-gacha-delay.cjs
docker compose run --rm --no-deps --entrypoint node marinara --check /app/novelai-gacha-delay.cjs && \
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


## Gacha Forge 1.8.13 호환성 (2026-10-21)

기존 `novelai-gacha-delay.cjs`에서 **1.8.12 및 1.8.13 호출 경로를 모두 인식**하도록 확장했습니다. 원래의 2,000~5,000ms 대기, 첫 요청 즉시 실행, NovelAI 제공자만 대상인 동작은 유지합니다. 1.8.13 가짜 요청 테스트에서 다른 제공자 우회와 순차 대기가 확인되었으며, 실제 이미지 API 호출/실사용 검증은 별도입니다. 기존 README의 설치 방법과 확인 로그를 그대로 사용합니다.
