export type MockTag = {
  id: string;
  name: string;
};

export const mockTags: MockTag[] = [
  { id: "tag_sis", name: "システム英単語" },
  { id: "tag_duo", name: "DUO 3.0" },
  { id: "tag_pass", name: "パス単 準1級" },
  { id: "tag_news", name: "ニュース" },
  { id: "tag_app", name: "アプリ: mikan" },
  { id: "tag_movie", name: "映画字幕" },
];

export function findTag(id: string): MockTag | undefined {
  return mockTags.find((tag) => tag.id === id);
}
