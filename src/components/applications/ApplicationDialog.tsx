
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "../../components/ui/form";
import { Input } from "../../components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { TabsList, TabsTrigger, Tabs, TabsContent } from "@/components/ui/tabs";
import { FilePlus, Loader2, CreditCard, FileText, PenLine, Briefcase, Calendar } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "../../hooks/use-toast";
import ImageUploader from "../common/ImageUploader";
import { 
  getTransactionTypesByCategory,
  TransactionType,
  getAssetTypes,
  AssetType
} from "../../utils/config-api";
import { getDepartments, Department } from "../../utils/departments-api";
import { useAuth } from "../../contexts/AuthContext";


// 更新表单Schema，增加资产信息和借贷相关字段
const defaultFormSchema = z.object({
  type: z.string({
    required_error: "请选择申请类型",
  }),
  title: z.string().min(2, {
    message: "标题至少需要2个字符",
  }),
  amount: z.string().min(1, {
    message: "请输入金额",
  }),
  department: z.string().min(1, {
    message: "申请部门",
  }),
  // 添加备注字段（对采购资产类型可选）
  description: z.string().optional(),
  // 图片上传是可选的
  images: z.array(z.string()).optional(),
  // 采购和销售申请特有字段
  relatedParty: z.string().optional(),
  // 借入借出申请特有字段
  dueDate: z.string().optional(),
  borrower: z.string().optional(),
  
  // 资产类型特有字段
  assetName: z.string().optional(),
  assetType: z.string().optional(),
  assetQuantity: z.string().optional(),
  unitPrice: z.string().optional(),
  
  // 流水类型分类
  transactionCategory: z.enum(["支出", "采购资产", "借出"]).optional(),
});

interface ApplicationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: z.infer<typeof defaultFormSchema>) => void;
  presetType?: 'payment' | 'income' | 'purchase' | 'sales' | 'borrowing' | 'lending'; // 预设的申请类型
}

export function ApplicationDialog({ isOpen, onClose, onSubmit, presetType }: ApplicationDialogProps) {
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [transactionTypes, setTransactionTypes] = useState<TransactionType[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAssetTypes, setIsLoadingAssetTypes] = useState(false);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTransactionType, setSelectedTransactionType] = useState<string>("支出");
  const { toast } = useToast();
  const { user } = useAuth(); // 获取当前登录用户信息
  
  // 使用默认表单架构
  const form = useForm<z.infer<typeof defaultFormSchema>>({
    resolver: zodResolver(defaultFormSchema),
    defaultValues: {
      type: "",
      title: "",
      amount: "",
      department: "",
      description: "",
      images: [],
      relatedParty: "",
      dueDate: "",
      borrower: "",
      assetName: "",
      assetType: "",
      assetQuantity: "1",
      unitPrice: "",
      transactionCategory: "支出",
    },
  });
  
  // 加载资产类型
  useEffect(() => {
    if (isOpen && presetType === 'payment') {
      const loadAssetTypes = async () => {
        setIsLoadingAssetTypes(true);
        try {
          // 尝试从API获取资产类型
          const types = await getAssetTypes();
          if (types && types.length > 0) {
            setAssetTypes(types);
          } else {
            // 如果API未返回数据，使用默认资产类型
            setAssetTypes([]);
          }
        } catch (error) {
          console.error('加载资产类型失败:', error);
          // 使用默认资产类型
          setAssetTypes([]);
        } finally {
          setIsLoadingAssetTypes(false);
        }
      };
      
      loadAssetTypes();
    }
  }, [isOpen, presetType]);
  
  // 当对话框打开时，加载相应类别的流水类型
  useEffect(() => {
    if (isOpen && presetType) {
      const loadTransactionTypes = async () => {
        setIsLoading(true);
        try {
          // 根据预设类型确定流水类别
          let category: 'income' | 'expense' = 'expense';
          
          switch (presetType) {
            case 'income':
            case 'sales':
              category = 'income';
              break;
            case 'payment':
            case 'purchase':
            case 'lending':
              category = 'expense';
              break;
            case 'borrowing':
              category = 'income';
              break;
            default:
              category = 'expense';
          }
          
          const types = await getTransactionTypesByCategory(category);
          setTransactionTypes(types);
          
          // 对于付款申请，默认设置为"支出"
          if (presetType === 'payment') {
            setSelectedTransactionType("支出");
            form.setValue('transactionCategory', "支出");
          }
          
        } catch (error) {
          console.error('加载流水类型失败:', error);
        } finally {
          setIsLoading(false);
        }
      };
      
      loadTransactionTypes();
    }
  }, [isOpen, presetType, form]);
  
  // 加载部门列表和设置用户部门
  useEffect(() => {
    if (isOpen) {
      // 1. 设置表单部门为当前用户所属部门
      if (user?.department) {
        console.log('自动设置部门为用户所属部门:', user.department);
        form.setValue('department', user.department);
      } else {
        console.log('用户没有部门信息，需要加载部门列表');
      }
      
      // 2. 加载部门列表（为了展示表单）
      const loadDepartments = async () => {
        setIsLoadingDepartments(true);
        try {
          const result = await getDepartments();
          console.log('获取到的部门列表:', result);
          
          if (result.success && result.departments) {
            // 确保类型安全的赋值
            const departmentsList: Department[] = result.departments;
            setDepartments(departmentsList);
            
            // 如果用户没有部门信息，但有部门列表，默认选中第一个
            if (departmentsList.length > 0 && !form.getValues('department')) {
              form.setValue('department', String(departmentsList[0].id));
            }
          } else {
            console.error('加载部门列表返回错误:', result.message);
          }
        } catch (error) {
          console.error('加载部门列表失败:', error);
        } finally {
          setIsLoadingDepartments(false);
        }
      };
      
      loadDepartments();
    }
  }, [isOpen, form, user]);

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string;
      setUploadedImages(prev => [...prev, imageUrl]);
      form.setValue('images', [...uploadedImages, imageUrl]);
    };
    reader.readAsDataURL(file);
  };

  // 处理流水类型标签切换
  const handleTransactionCategoryChange = (category: string) => {
    setSelectedTransactionType(category);
    form.setValue('transactionCategory', category as "支出" | "采购资产" | "借出");
    
    // 如果选择了采购资产，重新计算金额（数量 * 单价）
    if (category === "采购资产") {
      const quantity = form.getValues("assetQuantity") || "1";
      const unitPrice = form.getValues("unitPrice") || "0";
      const totalAmount = parseFloat(quantity) * parseFloat(unitPrice);
      
      if (!isNaN(totalAmount)) {
        form.setValue("amount", totalAmount.toString());
      }
    }
  };

  // 当资产数量或单价变化时，自动更新总金额
  const updateAssetTotalAmount = () => {
    const quantity = form.getValues("assetQuantity") || "1";
    const unitPrice = form.getValues("unitPrice") || "0";
    const totalAmount = parseFloat(quantity) * parseFloat(unitPrice);
    
    if (!isNaN(totalAmount)) {
      form.setValue("amount", totalAmount.toString());
    }
  };

  const handleSubmit = async (values: z.infer<typeof defaultFormSchema>) => {
    // 避免重复提交
    if (isSubmitting) return;

    // 设置提交中状态
    setIsSubmitting(true);
    
    // 准备提交数据
    const finalValues = {
      ...values,
      images: uploadedImages,
    };
    
    // 根据交易类型，添加附加信息
    if (values.transactionCategory === "采购资产") {
      // 采购资产时，生成资产信息
      finalValues.title = `采购${values.assetName || "资产"}`;
      // 不需要额外的备注
      finalValues.description = `资产名称: ${values.assetName}, 资产类型: ${values.assetType}, 数量: ${values.assetQuantity}, 单价: ${values.unitPrice}元`;
    } else if (values.transactionCategory === "借出") {
      // 借出时，添加借款对象和还款期限
      finalValues.title = `借出款项给${values.borrower || ""}`;
      finalValues.description = `借款对象: ${values.borrower}, 预计还款时间: ${values.dueDate}, 金额: ${values.amount}元`;
    } else if (!values.description) {
      // 对于一般支出，如果没有备注，生成默认备注
      finalValues.description = `${values.title} - ${values.department} - ${values.amount}元`;
    }
    
    console.log("提交表单数据:", finalValues);
    
    try {
      // 等待提交完成
      await onSubmit(finalValues);
      
      // 提交成功，显示成功提示
      let successMessage = '';
      switch (presetType) {
        case 'income':
          successMessage = '收款申请';
          break;
        case 'payment':
          if (values.transactionCategory === "采购资产") {
            successMessage = '资产采购申请';
          } else if (values.transactionCategory === "借出") {
            successMessage = '借出申请';
          } else {
            successMessage = '付款申请';
          }
          break;
        case 'purchase':
          successMessage = '采购申请';
          break;
        case 'sales':
          successMessage = '销售申请';
          break;
        case 'borrowing':
          successMessage = '借入申请';
          break;
        case 'lending':
          successMessage = '借出申请';
          break;
        default:
          successMessage = '申请';
      }
      
      toast({
        title: "申请提交成功",
        description: `您的${successMessage}已成功提交`,
        variant: "default",
      });
      
      // 重置表单
      setUploadedImages([]);
      form.reset();
      
      // 关闭对话框
      onClose();
    } catch (error) {
      // 提交失败，显示错误提示
      console.error("申请提交失败:", error);
      toast({
        title: "申请提交失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive",
      });
    } finally {
      // 无论成功还是失败，都结束提交状态
      setIsSubmitting(false);
    }
  };

  // 判断是否显示付款申请特定的标签页组件（仅用于付款申请）
  const showPaymentTabs = presetType === 'payment';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {presetType === 'income' ? '申请收款' :
             presetType === 'payment' ? '申请付款' :
             presetType === 'purchase' ? '采购申请' :
             presetType === 'sales' ? '销售申请' : 
             presetType === 'borrowing' ? '借入申请' : 
             presetType === 'lending' ? '借出申请' : 
             '提交新申请'}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* 付款申请的流水类型标签页 */}
            {showPaymentTabs && (
              <Tabs 
                defaultValue="支出" 
                value={selectedTransactionType}
                onValueChange={handleTransactionCategoryChange}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="支出" className="flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4" />
                    <span>普通支出</span>
                  </TabsTrigger>
                  <TabsTrigger value="采购资产" className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" />
                    <span>采购资产</span>
                  </TabsTrigger>
                  <TabsTrigger value="借出" className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    <span>借出款项</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            
            {/* 普通支出和非付款申请表单 */}
            {(!showPaymentTabs || selectedTransactionType === "支出") && (
              <>
                {/* 普通支出需要标题 */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>标题</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入申请标题" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {presetType === 'purchase' || presetType === 'sales' ? '预估金额' : '金额'}
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder={`请输入${presetType === 'purchase' || presetType === 'sales' ? '预估金额' : '申请金额'}`} 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* 普通支出需要备注 */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>备注说明</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="请输入备注说明（可选）" 
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
            
            {/* 采购资产特有表单 */}
            {showPaymentTabs && selectedTransactionType === "采购资产" && (
              <>
                <FormField
                  control={form.control}
                  name="assetName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>资产名称</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入资产名称" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="assetType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>资产类型</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingAssetTypes ? "加载中..." : "选择资产类型"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingAssetTypes ? (
                            <div className="flex items-center justify-center py-2">
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              <span>加载中...</span>
                            </div>
                          ) : assetTypes.length > 0 ? (
                            assetTypes.map((type) => (
                              <SelectItem key={type.id} value={type.name}>
                                {type.name}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="default">默认资产类型</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="assetQuantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>数量</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="请输入数量" 
                            {...field} 
                            onChange={(e) => {
                              field.onChange(e);
                              updateAssetTotalAmount();
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="unitPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>单价</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="请输入单价" 
                            {...field} 
                            onChange={(e) => {
                              field.onChange(e);
                              updateAssetTotalAmount();
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>总金额</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          disabled={true}
                          placeholder="计算中..." 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
            
            {/* 借出款项特有表单 */}
            {showPaymentTabs && selectedTransactionType === "借出" && (
              <>
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>标题</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入借款事由" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="borrower"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>借款对象</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入借款对象" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>借款金额</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="请输入借款金额" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>预计还款日期</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field} 
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>备注说明</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="请输入备注说明（可选）" 
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
            
            {/* 采购和销售申请特有字段：相关方 */}
            {(presetType === 'purchase' || presetType === 'sales') && (
              <FormField
                control={form.control}
                name="relatedParty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{presetType === 'purchase' ? '供应商' : '客户'}</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder={`请输入${presetType === 'purchase' ? '供应商名称' : '客户名称'}`} 
                        {...field} 
                        value={field.value || ''}
                        onChange={(e) => {
                          field.onChange(e);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            {/* 借入申请特有字段：期限 (针对presetType='borrowing') */}
            {presetType === 'borrowing' && (
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>期限</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field} 
                        value={field.value || ''}
                        onChange={(e) => {
                          field.onChange(e);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            {/* 部门信息（所有表单共有） */}
            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>申请部门 *</FormLabel>
                  {/* 此前是只读文本、且只提交部门名；
                      审批链的第一级是部门主管，后端需要 departmentId */}
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="请选择申请部门" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {departments.map((d: any) => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* 上传图片（所有表单共有） */}
            <FormField
              control={form.control}
              name="images"
              render={() => (
                <FormItem>
                  <FormLabel>上传图片</FormLabel>
                  <FormControl>
                    <ImageUploader 
                      onImageUpload={handleImageUpload}
                      initialImages={uploadedImages}
                      multiple={true}
                      maxFiles={5}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    提交中...
                  </>
                ) : (
                  "提交"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
