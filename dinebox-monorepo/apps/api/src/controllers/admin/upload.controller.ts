/** 上传控制器：菜品图片。 */
import type { AppContext } from '../../types/context.js';
import { HttpError, success } from '../../utils/http.js';
import { operatorOf } from '../helpers.js';
import { handleDishImageUpload } from '../../services/admin/upload.service.js';

export async function uploadDishImage(c: AppContext) {
  const user = operatorOf(c);
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!(file instanceof File)) {
    throw new HttpError(400, '请选择要上传的图片');
  }
  const result = await handleDishImageUpload(file, user.id);
  return success(c, result, '上传成功', 201);
}
