import { getRequestConfig } from 'next-intl/server';
import zhMessages from '../messages/zh.json';

export default getRequestConfig(async () => ({
  locale: 'zh',
  messages: zhMessages,
}));
