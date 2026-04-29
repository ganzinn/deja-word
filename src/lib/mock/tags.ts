export type MockTag = {
  id: string;
  name: string;
  hasPage: boolean;
};

export const mockTags: MockTag[] = [
  { id: "tag_sis", name: "システム英単語", hasPage: true },
  { id: "tag_duo", name: "DUO 3.0", hasPage: true },
  { id: "tag_pass", name: "パス単 準1級", hasPage: true },
  { id: "tag_news", name: "ニュース", hasPage: false },
  { id: "tag_app", name: "アプリ: mikan", hasPage: false },
  { id: "tag_movie", name: "映画字幕", hasPage: false },
];

export function findTag(id: string): MockTag | undefined {
  return mockTags.find((tag) => tag.id === id);
}
