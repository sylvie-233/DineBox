import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { ImagePlus, Plus, RefreshCw } from 'lucide-react';

import type { Addon, AdminCatalog, Category, Dish, DishSaveInput } from '@dinebox/types';
import { formatMoney, moneyFixed } from '@dinebox/utils';

import { adminFetch, adminUpload } from '@/lib/api';
import { useConfirm } from '@/lib/store/confirm';
import { usePrompt } from '@/lib/store/prompt';
import { useToast } from '@/lib/store/toast';
import { EmptyState, LoadingRows } from '@/components/feedback';
import { Modal } from '@/components/modal';
import { Pagination } from '@/components/pagination';

const PAGE_SIZE = 8;

interface SpecOptionForm {
  name: string;
  priceDiff: string;
}

interface SpecGroupForm {
  name: string;
  options: SpecOptionForm[];
}

interface DishFormState {
  id?: number;
  name: string;
  description: string;
  categoryId: string;
  price: string;
  sort: string;
  status: 'ON' | 'OFF';
  soldOut: boolean;
  imageFileId: number | null;
  imageUrl: string;
  specs: SpecGroupForm[];
  addonIds: number[];
}

interface AddonFormState {
  id?: number;
  name: string;
  price: string;
  maxSelect: string;
}

function emptyDishForm(categories: Category[], categoryId: number | null): DishFormState {
  return {
    name: '',
    description: '',
    categoryId: String(categoryId ?? categories[0]?.id ?? ''),
    price: '',
    sort: '0',
    status: 'ON',
    soldOut: false,
    imageFileId: null,
    imageUrl: '',
    specs: [],
    addonIds: [],
  };
}

function dishToForm(dish: Dish): DishFormState {
  return {
    id: dish.id,
    name: dish.name,
    description: dish.description,
    categoryId: String(dish.categoryId),
    price: moneyFixed(dish.price),
    sort: String(dish.sort),
    status: dish.status,
    soldOut: dish.soldOut,
    imageFileId: dish.imageFileId,
    imageUrl: dish.imageUrl ?? '',
    specs: dish.specs.map((group) => ({
      name: group.name,
      options: group.options.map((option) => ({
        name: option.name,
        priceDiff: moneyFixed(option.priceDiff),
      })),
    })),
    addonIds: dish.addons.map((addon) => addon.id),
  };
}

function addonLimitLabel(limit: number): string {
  return limit > 0 ? `限 ${limit} 份` : '不限份数';
}

export function DishesPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { prompt } = usePrompt();
  const { data, error, isLoading, mutate } = useSWR<AdminCatalog>(['/catalog'], () =>
    adminFetch<AdminCatalog>('/catalog'),
  );

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [dishForm, setDishForm] = useState<DishFormState | null>(null);
  const [savingDish, setSavingDish] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [addonOpen, setAddonOpen] = useState(false);
  const [addonForm, setAddonForm] = useState<AddonFormState | null>(null);
  const [savingAddon, setSavingAddon] = useState(false);

  const categories = data?.categories ?? [];
  const dishes = data?.dishes ?? [];
  const addons = data?.addons ?? [];

  const filteredDishes = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    return dishes.filter((dish) => {
      const matchCategory =
        selectedCategoryId === null || dish.categoryId === selectedCategoryId;
      const matchKeyword =
        !term ||
        `${dish.name} ${dish.description} ${dish.categoryName ?? ''}`
          .toLowerCase()
          .includes(term);
      return matchCategory && matchKeyword;
    });
  }, [dishes, selectedCategoryId, keyword]);

  useEffect(() => {
    setPage(1);
  }, [selectedCategoryId, keyword]);

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(filteredDishes.length / PAGE_SIZE))));
  }, [filteredDishes.length]);

  const totalPages = Math.max(1, Math.ceil(filteredDishes.length / PAGE_SIZE));
  const pagedDishes = filteredDishes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);
  const listTitle = keyword.trim()
    ? `搜索“${keyword.trim()}”`
    : selectedCategory?.name ?? '全部菜品';

  if (isLoading && !data) {
    return (
      <div className="page show">
        <LoadingRows rows={8} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="page show">
        <div className="card">
          <EmptyState title="菜品加载失败" text={error?.message} />
        </div>
      </div>
    );
  }

  const addCategory = async (): Promise<void> => {
    const name = await prompt({
      title: '新增分类',
      label: '分类名称',
      placeholder: '如：特色小炒',
      validate: (value) => (value.length > 32 ? '分类名称最多 32 字' : null),
    });
    if (!name) return;
    try {
      await adminFetch('/catalog/categories', { method: 'POST', body: { name } });
      toast('分类已新增', 'success');
      await mutate();
    } catch (categoryError) {
      toast(categoryError instanceof Error ? categoryError.message : '新增失败', 'error');
    }
  };

  const renameCategory = async (category: Category): Promise<void> => {
    const name = await prompt({
      title: '重命名分类',
      label: '分类名称',
      defaultValue: category.name,
      validate: (value) => (value.length > 32 ? '分类名称最多 32 字' : null),
    });
    if (!name || name === category.name) return;
    try {
      await adminFetch(`/catalog/categories/${category.id}`, {
        method: 'PUT',
        body: { name },
      });
      toast('分类已更新', 'success');
      await mutate();
    } catch (categoryError) {
      toast(categoryError instanceof Error ? categoryError.message : '更新失败', 'error');
    }
  };

  const deleteCategory = async (category: Category): Promise<void> => {
    const ok = await confirm({
      title: `删除分类「${category.name}」？`,
      text: '分类下没有菜品时才能删除；历史订单因快照不受影响。',
      okText: '删除分类',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminFetch(`/catalog/categories/${category.id}`, { method: 'DELETE' });
      toast('分类已删除', 'success');
      if (selectedCategoryId === category.id) setSelectedCategoryId(null);
      await mutate();
    } catch (categoryError) {
      toast(categoryError instanceof Error ? categoryError.message : '删除失败', 'error');
    }
  };

  const moveCategory = async (category: Category, direction: 'up' | 'down'): Promise<void> => {
    try {
      await adminFetch(`/catalog/categories/${category.id}/move`, {
        method: 'POST',
        body: { direction },
      });
      await mutate();
    } catch (moveError) {
      toast(moveError instanceof Error ? moveError.message : '排序失败', 'error');
    }
  };

  const openDishCreate = (): void => {
    setDishForm(emptyDishForm(categories, selectedCategoryId));
  };

  const openDishEdit = (dish: Dish): void => {
    setDishForm(dishToForm(dish));
  };

  const saveDish = async (): Promise<void> => {
    if (!dishForm) return;
    if (!dishForm.name.trim()) {
      toast('请输入菜品名称', 'error');
      return;
    }
    if (!dishForm.categoryId) {
      toast('请选择所属分类', 'error');
      return;
    }
    const price = Number(dishForm.price);
    if (!Number.isFinite(price) || price < 0) {
      toast('请输入不小于 0 的售价', 'error');
      return;
    }
    const specs: DishSaveInput['specs'] = [];
    for (const group of dishForm.specs) {
      const groupName = group.name.trim();
      if (!groupName) {
        toast('规格组名称不能为空', 'error');
        return;
      }
      const options = group.options.map((option) => ({
        name: option.name.trim(),
        priceDiff: Number(option.priceDiff || 0),
      }));
      if (options.length === 0 || options.some((option) => !option.name)) {
        toast(`规格组「${groupName}」至少需要一个命名选项`, 'error');
        return;
      }
      if (options.some((option) => !Number.isFinite(option.priceDiff))) {
        toast(`规格组「${groupName}」存在无效差价`, 'error');
        return;
      }
      if (options.some((option) => price + option.priceDiff < 0)) {
        toast(`规格组「${groupName}」的选项到手价不能为负`, 'error');
        return;
      }
      specs.push({ name: groupName, options });
    }

    const payload: DishSaveInput = {
      name: dishForm.name.trim(),
      description: dishForm.description.trim(),
      categoryId: Number(dishForm.categoryId),
      price,
      sort: Number(dishForm.sort || 0),
      status: dishForm.status,
      soldOut: dishForm.soldOut,
      imageFileId: dishForm.imageFileId,
      specs,
      addonIds: dishForm.addonIds,
    };
    setSavingDish(true);
    try {
      if (dishForm.id) {
        await adminFetch(`/catalog/dishes/${dishForm.id}`, { method: 'PUT', body: payload });
        toast('菜品已更新', 'success');
      } else {
        await adminFetch('/catalog/dishes', { method: 'POST', body: payload });
        toast('菜品已新增', 'success');
      }
      setDishForm(null);
      await mutate();
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : '保存失败', 'error');
    } finally {
      setSavingDish(false);
    }
  };

  const toggleDish = async (
    dish: Dish,
    body: { soldOut?: boolean; status?: 'ON' | 'OFF' },
  ): Promise<void> => {
    try {
      await adminFetch(`/catalog/dishes/${dish.id}/toggle`, { method: 'POST', body });
      toast('菜品状态已更新', 'success');
      await mutate();
    } catch (toggleError) {
      toast(toggleError instanceof Error ? toggleError.message : '操作失败', 'error');
    }
  };

  const deleteDish = async (dish: Dish): Promise<void> => {
    const ok = await confirm({
      title: `删除菜品「${dish.name}」？`,
      text: '删除只影响后续点单；历史订单保存了名称与价格快照，不受影响。',
      okText: '删除菜品',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminFetch(`/catalog/dishes/${dish.id}`, { method: 'DELETE' });
      toast('菜品已删除', 'success');
      await mutate();
    } catch (deleteError) {
      toast(deleteError instanceof Error ? deleteError.message : '删除失败', 'error');
    }
  };

  const uploadImage = async (file: File): Promise<void> => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await adminUpload<{ id: number; url: string }>(
        '/upload/dish-image',
        formData,
      );
      setDishForm((previous) =>
        previous
          ? { ...previous, imageFileId: result.id, imageUrl: result.url }
          : previous,
      );
      toast('图片已上传', 'success');
    } catch (uploadError) {
      toast(uploadError instanceof Error ? uploadError.message : '上传失败', 'error');
    } finally {
      setUploading(false);
    }
  };

  const saveAddon = async (): Promise<void> => {
    if (!addonForm) return;
    const name = addonForm.name.trim();
    const price = Number(addonForm.price);
    const maxSelect = Number(addonForm.maxSelect || 0);
    if (!name) {
      toast('请输入加料名称', 'error');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast('请输入不小于 0 的加价金额', 'error');
      return;
    }
    if (!Number.isInteger(maxSelect) || maxSelect < 0) {
      toast('限选数量无效', 'error');
      return;
    }
    setSavingAddon(true);
    try {
      if (addonForm.id) {
        await adminFetch(`/catalog/addons/${addonForm.id}`, {
          method: 'PUT',
          body: { name, price, maxSelect },
        });
        toast('加料已更新', 'success');
      } else {
        await adminFetch('/catalog/addons', {
          method: 'POST',
          body: { name, price, maxSelect },
        });
        toast('加料已新增', 'success');
      }
      setAddonForm(null);
      await mutate();
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : '保存失败', 'error');
    } finally {
      setSavingAddon(false);
    }
  };

  const deleteAddon = async (addon: Addon): Promise<void> => {
    const ok = await confirm({
      title: `删除加料「${addon.name}」？`,
      text: '删除后会自动解除与所有菜品的绑定，历史订单加料快照不受影响。',
      okText: '删除加料',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminFetch(`/catalog/addons/${addon.id}`, { method: 'DELETE' });
      toast('加料已删除', 'success');
      await mutate();
    } catch (deleteError) {
      toast(deleteError instanceof Error ? deleteError.message : '删除失败', 'error');
    }
  };

  const modifyDishForm = (patch: Partial<DishFormState>): void => {
    setDishForm((previous) => (previous ? { ...previous, ...patch } : previous));
  };

  const updateSpecGroup = (groupIndex: number, group: SpecGroupForm): void => {
    if (!dishForm) return;
    const specs = dishForm.specs.map((item, index) => (index === groupIndex ? group : item));
    modifyDishForm({ specs });
  };

  return (
    <div className="page show">
      <div className="dish-layout">
        <div className="cat-panel">
          <div className="card">
            <div className="card-title">
              菜品分类
              <span className="sub">悬停可编辑 / 排序</span>
              <button type="button" className="btn sm" onClick={() => void addCategory()}>
                <Plus size={12} />
              </button>
            </div>
            <button
              type="button"
              className={`cat-item ${selectedCategoryId === null ? 'active' : ''}`}
              onClick={() => {
                setSelectedCategoryId(null);
                setKeyword('');
              }}
            >
              <span>全部菜品</span>
              <span className="cnt">{dishes.length}</span>
            </button>
            {categories.map((category) => (
              <div
                key={category.id}
                className={`cat-item ${selectedCategoryId === category.id ? 'active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setSelectedCategoryId(category.id);
                  setKeyword('');
                }}
                role="presentation"
              >
                <span>{category.name}</span>
                <span className="cnt">{category.dishCount ?? 0}</span>
                <span className="cops" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    className="cbtn"
                    title="上移"
                    onClick={() => void moveCategory(category, 'up')}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="cbtn"
                    title="下移"
                    onClick={() => void moveCategory(category, 'down')}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="cbtn"
                    title="重命名"
                    onClick={() => void renameCategory(category)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="cbtn"
                    title="删除"
                    onClick={() => void deleteCategory(category)}
                  >
                    ✕
                  </button>
                </span>
              </div>
            ))}
            <div className="cat-foot num">
              共 <b>{categories.length}</b> 个分类 · <b>{dishes.length}</b> 道菜品
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card">
            <div className="card-title">
              <span>
                {listTitle}
                <span className="sub" style={{ marginLeft: 6 }}>
                  {filteredDishes.length} 道
                </span>
              </span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={keyword}
                  placeholder="搜索菜品名称 / 分类"
                  className="title-search"
                  onChange={(event) => setKeyword(event.target.value)}
                />
                <button type="button" className="btn sm" onClick={() => setAddonOpen(true)}>
                  加料管理 <b className="num">({addons.length})</b>
                </button>
                <button type="button" className="btn sm" onClick={() => void mutate()}>
                  <RefreshCw size={12} />
                </button>
                <button type="button" className="btn primary sm" onClick={openDishCreate}>
                  ＋ 新增菜品
                </button>
              </span>
            </div>

            {pagedDishes.length === 0 ? (
              <EmptyState
                title={keyword.trim() ? '没有匹配的菜品' : '该分类暂无菜品'}
                text="调整搜索词或新增菜品"
              />
            ) : (
              <div className="table-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>菜品</th>
                      <th>分类</th>
                      <th>售价</th>
                      <th>规格 / 加料</th>
                      <th>排序</th>
                      <th>状态</th>
                      <th style={{ width: 238 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedDishes.map((dish) => (
                      <tr key={dish.id}>
                        <td>
                          <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                            <span className="thumb">
                              {dish.imageUrl ? (
                                <img src={dish.imageUrl} alt={dish.name} />
                              ) : (
                                dish.name.slice(0, 1)
                              )}
                            </span>
                            <span>
                              <b style={{ fontSize: 13 }}>{dish.name}</b>
                              <span className="mini-muted" style={{ display: 'block' }}>
                                {dish.description || '—'}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td>{dish.categoryName}</td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          ¥{formatMoney(dish.price)}
                        </td>
                        <td className="mini-muted" style={{ maxWidth: 160 }}>
                          {dish.specs.map((group) => group.name).join('、') || '无规格'}
                          {dish.addons.length > 0 ? ` · 加料×${dish.addons.length}` : ''}
                        </td>
                        <td className="num">{dish.sort}</td>
                        <td>
                          <div className="inline-actions">
                            <span className={`badge ${dish.status === 'ON' ? 'badge-green' : 'badge-gray'}`}>
                              {dish.status === 'ON' ? '在售' : '下架'}
                            </span>
                            {dish.soldOut ? <span className="badge badge-red">售罄</span> : null}
                          </div>
                        </td>
                        <td>
                          <div className="inline-actions">
                            <button type="button" className="btn-text" onClick={() => openDishEdit(dish)}>
                              编辑
                            </button>
                            <button
                              type="button"
                              className="btn-text"
                              onClick={() => void toggleDish(dish, { soldOut: !dish.soldOut })}
                            >
                              {dish.soldOut ? '恢复售卖' : '售罄'}
                            </button>
                            <button
                              type="button"
                              className="btn-text"
                              onClick={() =>
                                void toggleDish(dish, {
                                  status: dish.status === 'ON' ? 'OFF' : 'ON',
                                })
                              }
                            >
                              {dish.status === 'ON' ? '下架' : '上架'}
                            </button>
                            <button
                              type="button"
                              className="btn-text danger"
                              onClick={() => void deleteDish(dish)}
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Pagination
              page={page}
              totalPages={totalPages}
              total={filteredDishes.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
              unit="道"
            />
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(dishForm)}
        title={dishForm?.id ? '编辑菜品' : '新增菜品'}
        onClose={() => setDishForm(null)}
        width={560}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setDishForm(null)}>
              取消
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={savingDish}
              onClick={() => void saveDish()}
            >
              {savingDish ? '保存中…' : '保存菜品'}
            </button>
          </>
        }
      >
        {dishForm ? (
          <>
            <div className="field">
              <label>
                菜品名称 <i className="req">*</i>
              </label>
              <input
                value={dishForm.name}
                placeholder="如：酸汤肥牛"
                maxLength={64}
                onChange={(event) => modifyDishForm({ name: event.target.value })}
              />
            </div>

            <div className="field">
              <label>菜品卖点描述</label>
              <input
                value={dishForm.description}
                placeholder="如：酸辣开胃 · 现点现做"
                maxLength={200}
                onChange={(event) => modifyDishForm({ description: event.target.value })}
              />
            </div>

            <div className="field">
              <label>菜品图片</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="thumb" style={{ width: 48, height: 48 }}>
                  {dishForm.imageUrl ? (
                    <img src={dishForm.imageUrl} alt="菜品图片" />
                  ) : (
                    <ImagePlus size={18} />
                  )}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                    event.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? '上传中…' : '上传图片'}
                </button>
                <span className="mini-muted">
                  {dishForm.imageFileId ? '已上传，可在顾客端展示' : '未上传（使用占位图标）'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1.2 }}>
                <label>
                  所属分类 <i className="req">*</i>
                </label>
                <select
                  value={dishForm.categoryId}
                  style={{ width: '100%', height: 40 }}
                  onChange={(event) => modifyDishForm({ categoryId: event.target.value })}
                >
                  <option value="">请选择分类</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>
                  售价（元） <i className="req">*</i>
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={dishForm.price}
                  placeholder="0.00"
                  onChange={(event) => modifyDishForm({ price: event.target.value })}
                />
              </div>
              <div className="field" style={{ flex: 0.7 }}>
                <label>排序</label>
                <input
                  type="number"
                  value={dishForm.sort}
                  onChange={(event) => modifyDishForm({ sort: event.target.value })}
                />
              </div>
            </div>

            <div className="field">
              <label>
                规格组（选填）
                <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 11 }}>
                  如份量、辣度；选项可设差价，顾客端按所选规格计价
                </span>
              </label>
              {dishForm.specs.map((group, groupIndex) => (
                <div className="spec-group" key={groupIndex}>
                  <div className="sg-head">
                    <input
                      value={group.name}
                      placeholder="规格组名称，如：份量"
                      onChange={(event) =>
                        updateSpecGroup(groupIndex, { ...group, name: event.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="cbtn"
                      title="删除规格组"
                      onClick={() =>
                        modifyDishForm({
                          specs: dishForm.specs.filter((_, index) => index !== groupIndex),
                        })
                      }
                    >
                      ✕
                    </button>
                  </div>
                  {group.options.map((option, optionIndex) => {
                    const handPrice = Number(dishForm.price || 0) + Number(option.priceDiff || 0);
                    return (
                      <div className="sg-opt" key={optionIndex}>
                        <input
                          className="n"
                          value={option.name}
                          placeholder="选项名称，如：大份"
                          onChange={(event) => {
                            const options = group.options.map((item, index) =>
                              index === optionIndex ? { ...item, name: event.target.value } : item,
                            );
                            updateSpecGroup(groupIndex, { ...group, options });
                          }}
                        />
                        <input
                          className="p"
                          type="number"
                          step="0.5"
                          value={option.priceDiff}
                          placeholder="差价"
                          onChange={(event) => {
                            const options = group.options.map((item, index) =>
                              index === optionIndex
                                ? { ...item, priceDiff: event.target.value }
                                : item,
                            );
                            updateSpecGroup(groupIndex, { ...group, options });
                          }}
                        />
                        <span className="sg-price">
                          到手 <b>¥{formatMoney(handPrice)}</b>
                        </span>
                        <button
                          type="button"
                          className="cbtn"
                          title="删除选项"
                          onClick={() =>
                            updateSpecGroup(groupIndex, {
                              ...group,
                              options: group.options.filter((_, index) => index !== optionIndex),
                            })
                          }
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="btn sm"
                    style={{ marginTop: 4 }}
                    onClick={() =>
                      updateSpecGroup(groupIndex, {
                        ...group,
                        options: [...group.options, { name: '', priceDiff: '0' }],
                      })
                    }
                  >
                    ＋ 添加选项
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn sm"
                onClick={() =>
                  modifyDishForm({
                    specs: [
                      ...dishForm.specs,
                      { name: '', options: [{ name: '', priceDiff: '0' }] },
                    ],
                  })
                }
              >
                ＋ 添加规格组
              </button>
            </div>

            <div className="field">
              <label>绑定加料（选填）</label>
              {addons.length === 0 ? (
                <div className="form-hint">暂无加料，可先在「加料管理」中新增。</div>
              ) : (
                <div className="opt-chips">
                  {addons.map((addon) => {
                    const active = dishForm.addonIds.includes(addon.id);
                    return (
                      <button
                        key={addon.id}
                        type="button"
                        className={`opt ${active ? 'active' : ''}`}
                        onClick={() =>
                          modifyDishForm({
                            addonIds: active
                              ? dishForm.addonIds.filter((id) => id !== addon.id)
                              : [...dishForm.addonIds, addon.id],
                          })
                        }
                      >
                        {addon.name} +¥{formatMoney(addon.price)}
                        {addon.maxSelect > 0 ? `（${addonLimitLabel(addon.maxSelect)}）` : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="settle-line" style={{ padding: '4px 0' }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                上架（下架后顾客端不可见）
              </span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={dishForm.status === 'ON'}
                  onChange={(event) =>
                    modifyDishForm({ status: event.target.checked ? 'ON' : 'OFF' })
                  }
                />
                <span className="track" />
              </label>
            </div>
            <div className="settle-line" style={{ padding: '4px 0' }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                置为售罄（顾客端置灰不可选）
              </span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={dishForm.soldOut}
                  onChange={(event) => modifyDishForm({ soldOut: event.target.checked })}
                />
                <span className="track" />
              </label>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={addonOpen}
        title={addonForm ? (addonForm.id ? '编辑加料' : '新增加料') : '加料管理'}
        onClose={() => {
          setAddonOpen(false);
          setAddonForm(null);
        }}
        width={addonForm ? 420 : 560}
        footer={
          addonForm ? (
            <>
              <button type="button" className="btn" onClick={() => setAddonForm(null)}>
                返回列表
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={savingAddon}
                onClick={() => void saveAddon()}
              >
                {savingAddon ? '保存中…' : '保存加料'}
              </button>
            </>
          ) : (
            <>
              <span className="mini-muted">删除加料项会自动解除与菜品的绑定</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" onClick={() => setAddonOpen(false)}>
                  关闭
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setAddonForm({ name: '', price: '', maxSelect: '0' })}
                >
                  ＋ 新增加料
                </button>
              </span>
            </>
          )
        }
      >
        {addonForm ? (
          <>
            <div className="field">
              <label>
                加料名称 <i className="req">*</i>
              </label>
              <input
                value={addonForm.name}
                placeholder="如：煎蛋 / 宽粉 / 加米饭"
                maxLength={32}
                onChange={(event) =>
                  setAddonForm((previous) =>
                    previous ? { ...previous, name: event.target.value } : previous,
                  )
                }
              />
            </div>
            <div className="field">
              <label>
                加价金额（元） <i className="req">*</i>
              </label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={addonForm.price}
                placeholder="0.00"
                onChange={(event) =>
                  setAddonForm((previous) =>
                    previous ? { ...previous, price: event.target.value } : previous,
                  )
                }
              />
              <div className="form-hint">顾客加购该选项时，在菜品单价基础上加收。</div>
            </div>
            <div className="field">
              <label>每单限选数量</label>
              <input
                type="number"
                min={0}
                max={99}
                value={addonForm.maxSelect}
                onChange={(event) =>
                  setAddonForm((previous) =>
                    previous ? { ...previous, maxSelect: event.target.value } : previous,
                  )
                }
              />
              <div className="form-hint">0 表示不限；1 表示每单最多 1 份。</div>
            </div>
          </>
        ) : addons.length === 0 ? (
          <EmptyState title="暂无加料" text="点击「新增加料」创建第一个加料项" />
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>加料项</th>
                <th>加价</th>
                <th>限选</th>
                <th>绑定菜品数</th>
                <th style={{ width: 110 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {addons.map((addon) => (
                <tr key={addon.id}>
                  <td style={{ fontWeight: 600 }}>{addon.name}</td>
                  <td className="num">+¥{formatMoney(addon.price)}</td>
                  <td className="mini-muted">{addonLimitLabel(addon.maxSelect)}</td>
                  <td className="num">{addon.boundDishCount ?? 0}</td>
                  <td>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() =>
                          setAddonForm({
                            id: addon.id,
                            name: addon.name,
                            price: moneyFixed(addon.price),
                            maxSelect: String(addon.maxSelect),
                          })
                        }
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="btn-text danger"
                        onClick={() => void deleteAddon(addon)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}
