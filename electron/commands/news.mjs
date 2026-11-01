import { newsURL } from "../news-service.mjs";
export default async function execute(action, p, { news, shell }) {
  throw Error("校园快讯已取消，历史缓存保留在本机");
  if (action === "news.image") return news.image(p);
  if (action === "news.collect") return news.collect(p);
  if (action === "news.configure") return news.configure(p);
  if (action === "news.import") return news.import(p);
  if (action === "news.follow") return news.follow(p);
  if (action === "news.unfollow") return news.unfollow(p);
  if (action === "news.activity") return news.activity(p);
  if (action === "news.delete") return news.remove(p);
  if (action === "news.restore") return news.remove({ ...p, restore: true });
  if (action === "news.open") {
    return news.open(p);
  }
  return news.status();
}
