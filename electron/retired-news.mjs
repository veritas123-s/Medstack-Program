// Retain old cache files without exposing or collecting their contents.
export function retiredNews() {
  const status = () => ({
    retired: true,
    automatic: false,
    items: [],
    coverage: [],
    sources: [],
  });
  return {
    status,
    start() {},
    stop() {},
    stopForSwitch() {},
    image: async () => null,
    follow() {
      throw Error("校园快讯已取消");
    },
  };
}
