# 골고 폼 (GoalGo Form)

폰으로 찍은 축구 개인 훈련·레슨 영상을 넘기면 자세와 기술을 분석해 점수와 고칠 점을 보여 주는 웹 앱입니다.

- 찍은 영상만 넘기면 됩니다. 동작(드리블·슈팅·퍼스트 터치·패스·달리기)과 찍은 방향은 자동으로 알아챕니다.
- 분석은 폰 브라우저 안에서 합니다. 기록과 원본 영상은 내 구글 드라이브 `골고폼/` 폴더에 백업합니다.
- 기준값은 공개된 연구 자료에서 가져오고, 근거가 없는 지표는 내 지난 기록과 비교합니다.

## 문서
| 문서 | 내용 |
|---|---|
| [docs/lesson-criteria.md](docs/lesson-criteria.md) | 지표 체계 큰 설계 (기본 측정값 → 사건 → 동작·단계 → 지표 → 기준과 점수 → 피드백) |
| [docs/lesson-build.md](docs/lesson-build.md) | 구현 설계 (사용 흐름, 보정, 분석 위치, 계산 엔진, 기준표 형식, 정답 도구, 저장) |
| [docs/free-analysis.md](docs/free-analysis.md) | 자유 분석: 동작 알아채기, 코칭 근거, 샘플 시험 기록 |
| [docs/challenge.md](docs/challenge.md) | 도전 모드: 항목·과제·단계 구조, 공 다루기 사다리, 판정 방법 |
| [docs/lesson/](docs/lesson/) | 동작별 지표·기준값·점수·고칠 말 (드리블, 슈팅, 퍼스트 터치, 패스, 달리기·민첩성) |

## 상태
0.5.0 베타 (2026-11-27): 찍은 훈련 영상을 넘기면 리프팅·토 탭·당기고 밀기·드리블·패스·슈팅을 알아채고, 잘한 점·고칠 점·오늘의 연습·지난번과 비교·성장 리포트를 보여 줍니다. 슬로모션 자동 보정, 관절 선 다시 보기. 분석은 폰 안에서만(영상이 밖으로 나가지 않음).
- 앱: https://ahyeonfc.github.io/goalgo-form/
- 속도 시험: https://ahyeonfc.github.io/goalgo-form/bench/
- 개발: `npm install` → `npm run dev` / 시험 `npm test` / 빌드 `npm run build` (TypeScript + React + Vite)
- 개인정보처리방침: https://ahyeonfc.github.io/goalgo-form/privacy.html · 이용약관: …/terms.html
