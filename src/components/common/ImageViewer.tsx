import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "../ui/dialog";
import { Button } from "../ui/button";
import { Image } from "lucide-react";

interface ImageViewerProps {
  images: string[];
  triggerClassName?: string;
  iconSize?: number;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ 
  images,
  triggerClassName = "",
  iconSize = 18 
}) => {
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const hasImages = images.length > 0;

  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === 0 ? images.length - 1 : prevIndex - 1
    );
  };

  const goToNext = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === images.length - 1 ? 0 : prevIndex + 1
    );
  };

  if (!hasImages) {
    return (
      <Button 
        variant="ghost" 
        size="sm" 
        className={`p-1 opacity-40 cursor-not-allowed ${triggerClassName}`}
        disabled
      >
        <Image size={iconSize} />
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={`p-1 hover:bg-accent ${triggerClassName}`}
        >
          <Image size={iconSize} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>图片查看 ({currentIndex + 1}/{images.length})</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <div className="flex justify-center">
            <img 
              src={images[currentIndex]} 
              alt={`图片 ${currentIndex + 1}`} 
              className="max-h-[60vh] max-w-full object-contain"
            />
          </div>
          
          {images.length > 1 && (
            <div className="absolute inset-0 flex items-center justify-between">
              <Button 
                variant="ghost" 
                size="icon"
                className="h-10 w-10 rounded-full opacity-70 hover:opacity-100 bg-background"
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrevious();
                }}
              >
                &lt;
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-10 w-10 rounded-full opacity-70 hover:opacity-100 bg-background"
                onClick={(e) => {
                  e.stopPropagation();
                  goToNext();
                }}
              >
                &gt;
              </Button>
            </div>
          )}
        </div>
        
        {images.length > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            {images.map((_, index) => (
              <Button 
                key={index} 
                variant={index === currentIndex ? "default" : "outline"} 
                size="sm"
                className="w-8 h-8 p-0"
                onClick={() => setCurrentIndex(index)}
              >
                {index + 1}
              </Button>
            ))}
          </div>
        )}
        
        <div className="flex justify-end mt-4">
          <DialogClose asChild>
            <Button variant="outline">关闭</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageViewer;