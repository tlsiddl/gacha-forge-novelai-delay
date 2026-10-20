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

### 3. 기존 Docker 설정 백업

```bash
test -f docker-compose.override.yml || { echo "override 파일이 없습니다. 설정을 먼저 확인해 주세요."; exit 1; }
cp -a docker-compose.override.yml "docker-compose.override.yml.backup.$(date +%Y%m%d-%H%M%S)"
```

### 4. Docker Compose에 패치 등록

``docker-compose.override.yml`` 파일의 기존 `services.marinara` 아래에 새 볼륨 한 줄을 추가해 주세요.

```yaml
services:
  marinara:
    volumes:
      - ./novelai-gacha-delay.cjs:/app/novelai-gacha-delay.cjs:ro
```

위 예시는 **추가할 설정의 위치**를 보여주는 것입니다. 기존 override 파일 전체를 이 예시로 **덮어쓰지 마세요.** 이미 있는 `volumes` 항목에 새 줄만 추가해 주세요.

같은 서비스의 `environment.NODE_OPTIONS` 값 **맨 뒤에** 다음 값을 한 칸 띄워 추가해 주세요.

```text
--require=/app/novelai-gacha-delay.cjs
```

예를 들어 기존에 가속·한국어·CG 패치를 사용한다면 아래처럼 네 가지를 모두 유지하시면 됩니다.

```yaml
services:
  marinara:
    volumes:
      - ./me-speedup.cjs:/app/me-speedup.cjs:ro
      - ./gacha-ko-runtime.cjs:/app/gacha-ko-runtime.cjs:ro
      - ./gacha-cg-runtime.cjs:/app/gacha-cg-runtime.cjs:ro
      - ./novelai-gacha-delay.cjs:/app/novelai-gacha-delay.cjs:ro
    environment:
      NODE_OPTIONS: "--require=/app/me-speedup.cjs --require=/app/gacha-ko-runtime.cjs --require=/app/gacha-cg-runtime.cjs --require=/app/novelai-gacha-delay.cjs"
```

이전 패치가 없으시면 실제 사용 중인 설정에 맞게 조정해 주세요. `NODE_OPTIONS` 설정은 하나만 유지하고, 기존 다른 환경변수나 볼륨을 삭제하지 마세요.

수정이 어렵다면 `nano docker-compose.override.yml`로 파일을 열어 직접 추가하실 수 있습니다. 저장은 `Ctrl+O`, 종료는 `Ctrl+X`입니다.

### 5. 설정 및 문법 검사

```bash
docker compose config -q
docker compose run --rm --no-deps --entrypoint node marinara --check /app/novelai-gacha-delay.cjs
```

오류가 발생하면 재생성하기 전에 파일 경로와 YAML 들여쓰기를 확인해 주세요.

### 6. 컨테이너 재생성

```bash
docker compose up -d --force-recreate marinara
docker compose ps
```

### 7. 실제 적용 확인

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
