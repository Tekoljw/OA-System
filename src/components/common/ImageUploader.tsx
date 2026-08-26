import React, { useState, useRef } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "../ui/dialog";
import { Upload, Image as ImageIcon, X } from "lucide-react";

interface ImageUploaderProps {
  onImageUpload?: (file: File) => void;
  initialImages?: string[];
  multiple?: boolean;
  maxFiles?: number;
  disabled?: boolean;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImageUpload,
  initialImages = [],
  multiple = false,
  maxFiles = 5,
  disabled = false,
}) => {
  const [images, setImages] = useState<string[]>(initialImages);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // 检查是否超过最大文件数
    if (multiple && images.length + files.length > maxFiles) {
      alert(`最多只能上传${maxFiles}张图片`);
      return;
    }

    // 如果不是多文件上传，则清除之前的图片
    const newImages = multiple ? [...images] : [];

    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        const imageUrl = URL.createObjectURL(file);
        newImages.push(imageUrl);
        
        // 调用回调函数
        if (onImageUpload) {
          onImageUpload(file);
        }
      }
    });

    setImages(newImages);

    // 清除文件输入，允许选择同一个文件多次
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setImages(images.filter((_, index) => index !== indexToRemove));
  };

  const handlePreviewImage = (imageUrl: string) => {
    setPreviewImage(imageUrl);
  };

  return (
    <div className="w-full">
      <input
        type="file"
        accept="image/*"
        multiple={multiple}
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
      />

      <div className="flex flex-wrap gap-2 mb-2">
        {images.map((imageUrl, index) => (
          <div key={index} className="relative group">
            <div 
              className="border rounded-md overflow-hidden h-16 w-16 flex items-center justify-center cursor-pointer bg-gray-50"
              onClick={() => handlePreviewImage(imageUrl)}
            >
              <img 
                src={imageUrl} 
                alt={`上传图片 ${index + 1}`} 
                className="h-full w-full object-cover"
              />
            </div>
            {!disabled && (
              <button
                type="button"
                className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-0.5 hidden group-hover:block"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveImage(index);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}

        {(!multiple || images.length < maxFiles) && !disabled && (
          <div
            className="border border-dashed rounded-md h-16 w-16 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50"
            onClick={handleUploadClick}
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground mt-1">上传</span>
          </div>
        )}
      </div>

      {/* 图片预览对话框 */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>图片预览</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            {previewImage && (
              <img 
                src={previewImage} 
                alt="预览图片" 
                className="max-h-[70vh] max-w-full object-contain"
              />
            )}
          </div>
          <div className="flex justify-end">
            <DialogClose asChild>
              <Button variant="outline">关闭</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ImageUploader;