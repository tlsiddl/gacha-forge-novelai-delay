# Gacha Forge · NovelAI Image Delay

마리나라 가챠포지에서 NovelAI 이미지 생성 요청 사이에 **2~5초의 무작위 대기 시간**을 추가하는 독립 런타임 패치입니다. 마리나라 엔진과 가챠포지 원본 파일은 수정하지 않습니다.

> **비공식·실험적 패치입니다.** 실제 가챠포지 1.8.12 환경에서 NovelAI 요청 인식 및 두 번째 요청의 3,638ms 대기 로그가 확인되었습니다. 다른 버전과 구성에서의 동작은 보장하지 않으며, NovelAI 이용 정책 준수나 계정 차단 방지를 보장하지 않습니다.

## 동작 방식

- 인식된 NovelAI 연결의 첫 이미지 생성 요청은 즉시 실행합니다.
- 같은 연결의 다음 이미지 요청은 앞선 요청이 완료된 후 **2,000~5,000ms**를 무작위로 기다립니다.
- 요청은 연결별로 순차 처리합니다. 다른 이미지 제공자와 가챠포지 이외의 요청은 변경하지 않습니다.
- 기존 API 응답과 오류를 그대로 전달하며, 자동 재시도 기능을 별도로 추가하지 않습니다.
- 대기열은 Node.js 프로세스의 메모리에 저장됩니다. 여러 컨테이너 사이에 공유되지는 않습니다.

## 설치 방법 (Docker Compose)

1. `novelai-gacha-delay.cjs`를 마리나라 엔진 프로젝트 폴더(예: `/root/Marinara-Engine`)에 저장해 주세요.
2. 기존 `docker-compose.override.yml`을 백업해 주세요.
3. `install-snippet.yml`을 참고해 파일 마운트와 `NODE_OPTIONS`의 `--require=/app/novelai-gacha-delay.cjs`를 **기존 설정에 추가**해 주세요. 기존 설정을 덮어쓰지 마세요.
4. 아래 명령어로 설정을 검사하고 컨테이너를 다시 생성해 주세요.

```bash
cd /root/Marinara-Engine
docker compose config -q
docker compose up -d --force-recreate marinara
```

기존에 `me-speedup.cjs`, `gacha-ko-runtime.cjs`, `gacha-cg-runtime.cjs` 등을 사용하고 있다면 해당 마운트와 `--require` 옵션을 유지해 주세요.

## 실제 대기 시간 확인

가챠포지에서 **NovelAI를 사용하는 이미지 생성 또는 다시 그리기**를 순차적으로 두 번 실행한 후 로그를 확인해 주세요.

```bash
docker compose logs --since=30m marinara 2>&1 \
  | grep 'gacha-novelai-delay'
```

정상 작동 시 아래와 유사한 로그가 출력됩니다.

```text
[gacha-novelai-delay] preload loaded; NovelAI-only gating is active when provider metadata is recognized
[gacha-novelai-delay] first NovelAI image request (no delay)
[gacha-novelai-delay] waiting 3638ms before next NovelAI image request
```

**대기 시간만 확인**하려면 다음 명령어를 사용해 주세요.

```bash
docker compose logs --since=30m marinara 2>&1 \
  | grep -E 'gacha-novelai-delay.*(first NovelAI|waiting [0-9]+ms)'
```

`preload loaded`는 로딩 확인 로그일 뿐 실제 지연 작동을 증명하지 않습니다. `waiting ...ms` 로그를 확인해 주세요. 위 로그는 요청을 보내기 전에 대기하도록 실행된 시간을 나타내며, API에서 별도의 실제 소요 시간은 포함하지 않습니다.

## 로컬 검사

```bash
node --check novelai-gacha-delay.cjs
node selftest.cjs
```

로컬 테스트는 모의 요청을 대상으로 합니다. NovelAI API 자체의 정상 작동을 보장하지 않습니다.

## 제거 방법

`docker-compose.override.yml`에서 새 파일의 마운트와 `--require=/app/novelai-gacha-delay.cjs`만 제거한 뒤 `docker compose up -d --force-recreate marinara`를 실행해 주세요. 기존 패치 설정은 유지해 주세요.
