# 일반 방 무제한 / 랜덤매칭 30초

일반 방은 생성 옵션과 관계없이 항상 무제한입니다.
초 입력, 무제한 체크박스, 시간 적용 버튼을 제거했습니다.
랜덤매칭만 매 픽 30초를 사용하며 초기화 후에도 유지합니다.
이전 저장 방의 일반 선발 제한도 서버 시작 및 차례 처리 시 해제합니다.
빈 팀·연결 끊긴 팀 AI 선발 옵션은 시간 초과와 별개이며 기존 동작을 유지합니다.

## 업로드
ZIP의 파일을 GitHub의 같은 경로에 덮어쓰세요.
online-server/server.mjs와 ai-worker.mjs도 올리고 Render를 반드시 재배포해야 서버 규칙까지 바뀝니다.
프런트만 바꾸면 이전 서버의 30초 제한이 계속 실행될 수 있습니다.
검증: online-server에서 npm test.

## 접속 대기
페이지를 열 때 서버 준비 요청을 1회 보냅니다. 반복적으로 서버를 유지하는 별도 서비스는 추가하지 않았습니다.
무료 Render는 트래픽이 없는 상태에서 휴면했다가 다음 요청 때 다시 시작하므로 코드만으로 재시작 대기를 제거할 수 없습니다.
현재 서버 코드를 유지하려면 Render의 유료 컴퓨트를 사용하는 방법이 가장 간단합니다.
Railway로 옮길 경우 해당 서비스의 Serverless 옵션을 끄는 방법이 있습니다.
무료 범위를 우선한다면 Cloudflare Workers + SQLite Durable Objects 방식으로 서버를 이전할 수 있지만 현재 Node HTTP/WebSocket 서버의 재작성이 필요합니다.

공식 설명:
- https://render.com/docs/free
- https://render.com/docs/faq
- https://render.com/pricing
- https://docs.railway.com/pricing/plans
- https://docs.railway.com/pricing/cost-control
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/use-cases/web-apps/serverless-backends/
