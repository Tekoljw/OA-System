
import React from "react";
import { Switch } from "../ui/switch";
import { Permission, PermissionKey } from "../../types/permission";
import { Card } from "../ui/card";

interface PermissionListProps {
  permissions: Permission[];
  selectedPermissions: PermissionKey[];
  onChange: (permission: PermissionKey) => void;
}

export function PermissionList({ permissions, selectedPermissions, onChange }: PermissionListProps) {
  return (
    <Card className="border p-4">
      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
        {permissions.map((permission) => (
          <div 
            key={permission.id} 
            className={`flex items-center justify-between py-2 px-3 rounded-md transition-colors ${
              selectedPermissions.includes(permission.key) 
                ? 'bg-primary/10' 
                : 'hover:bg-muted/50'
            }`}
          >
            <div>
              <h4 className="text-sm font-medium">{permission.name}</h4>
              <p className="text-xs text-muted-foreground">{permission.description}</p>
            </div>
            <Switch
              checked={selectedPermissions.includes(permission.key)}
              onCheckedChange={() => onChange(permission.key)}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
